# stsh

個人用の gist / Pastebin ライクなテキストメモ置き場。

1 つの stash が複数ファイルを持ち、閲覧画面では Shiki によるシンタックスハイライトと
Markdown レンダリングを行う。ホスティングは Cloudflare Workers + D1、認証は
Cloudflare Access に委譲する（アプリ自身はログイン UI を持たない）。

## 技術構成

| 領域             | 採用                                                     |
| ---------------- | -------------------------------------------------------- |
| Backend          | Hono on Cloudflare Workers                                |
| Database         | Cloudflare D1 (SQLite)                                    |
| Frontend         | Svelte 5 (runes) / Vite 8                                 |
| Highlight        | Shiki（文法は言語ごとに遅延ロード）                       |
| Markdown         | marked + DOMPurify                                        |
| Auth             | Cloudflare Access の JWT (`Cf-Access-Jwt-Assertion`) 検証 |
| Package manager  | pnpm                                                      |

Worker と静的アセットは 1 つの Worker にまとまっており、デプロイは `wrangler deploy` 一発。
`@cloudflare/vite-plugin` により、ローカル開発でも本番と同じ workerd 上で Worker が動作する。

### ディレクトリ

```
src/
├── shared/     Worker と Client で共有する型・言語判定
├── worker/     Hono アプリ（API・raw 配信・Access JWT 検証）
└── client/     Svelte SPA
migrations/     D1 のスキーマ
```

## ルーティングと公開範囲

`run_worker_first` で `/api/*` と `/raw/*` だけが Worker に到達し、それ以外は静的アセット
（未マッチは `index.html` へフォールバック）になる。

| パス                       | 認証                         | 用途                       |
| -------------------------- | ---------------------------- | -------------------------- |
| `/`, `/new`, `/s/:id/edit` | 必須                         | 一覧・編集 UI              |
| `/api/stashes/*`           | 必須                         | CRUD                       |
| `/s/:id`                   | **Bypass 可**                | 閲覧ページ（SPA）          |
| `/api/public/stashes/:id`  | **Bypass 可**                | 閲覧ページが読む API       |
| `/raw/:id[/:filename]`     | **Bypass 可**                | 生テキスト                 |
| `/assets/*`, `/favicon.svg`| **Bypass 可**                | SPA のバンドル             |

「Bypass 可」の経路は Access を通さずに到達しうるため、Worker 側でも
`visibility = 'public'` の stash 以外は 404 を返して二重に防いでいる。private な stash の
存在自体も匿名クライアントには漏らさない。

## ローカル開発

```sh
pnpm install
cp .dev.vars.example .dev.vars   # 中身はダミーで良い（後述）
pnpm db:migrate                  # ローカル D1 (.wrangler/state) にスキーマ適用
pnpm dev                         # http://localhost:5173
```

ローカルでは Access が前段にいないため、`import.meta.env.DEV` が真のときだけ
固定の開発ユーザー (`dev@localhost`) として認証済み扱いになる。この分岐は本番ビルドから
消えるので、設定漏れで本番が素通しになることはない（Access の値が未設定なら 500 で落ちる）。
ローカルでは JWT 検証自体を通らないので、`.dev.vars` の中身はダミーでよい。

匿名アクセス（Access Bypass 経路）の挙動を試したいときは `x-dev-anonymous: 1` を付ける。

```sh
curl -H 'x-dev-anonymous: 1' http://localhost:5173/api/public/stashes/<id>
```

その他:

```sh
pnpm check     # svelte-check
pnpm build     # dist/ に client と worker を出力
pnpm preview   # 本番ビルドを workerd で起動
```

## デプロイ

### 1. Cloudflare にログイン

```sh
pnpm exec wrangler login
```

### 2. D1 を作成して ID を設定

```sh
pnpm exec wrangler d1 create stsh-db
```

出力された `database_id` を `wrangler.jsonc` の `d1_databases[0].database_id` に貼る。

これは秘密情報ではなく、アカウントの認証情報なしには何もできない単なるリソース ID なので
コミットしてよい（Cloudflare の公式テンプレートも同様）。wrangler が設定ファイル内で
環境変数の展開をサポートしないため、外出しすると全コマンドに `--config` を渡す必要が生じる。

### 3. 本番 D1 にマイグレーション適用

```sh
pnpm db:migrate:remote
```

### 4. デプロイ

```sh
pnpm deploy
```

この時点では Access 変数が未設定なので、API は 500 を返す（意図的に fail closed）。

### 5. Cloudflare Access を設定

Zero Trust ダッシュボード > Access > Applications で **Self-hosted** アプリケーションを作る。

まず本体を保護するアプリケーション:

- Application domain: `stsh.example.com`（Worker の Custom Domain、または `*.workers.dev`）
- Policy: Allow / Emails = 自分のアドレス

次に、閲覧系を素通しにする Bypass アプリケーションを **パスごとに** 作る。
Access はより具体的なパスを優先するため、以下は上のアプリより先に評価される。

| Application domain / path         | Policy          |
| --------------------------------- | --------------- |
| `stsh.example.com/s`              | Bypass Everyone |
| `stsh.example.com/raw`            | Bypass Everyone |
| `stsh.example.com/api/public`     | Bypass Everyone |
| `stsh.example.com/assets`         | Bypass Everyone |
| `stsh.example.com/favicon.svg`    | Bypass Everyone |

公開リンクを一切使わない運用なら、この Bypass アプリ群は作らなくてよい。その場合
`visibility` は単なるラベルとして残る。

### 6. Access の値を secret として登録

保護アプリケーションの **Overview** から AUD タグを、Zero Trust の設定からチーム名を取得する。

```sh
pnpm exec wrangler secret put ACCESS_TEAM_DOMAIN   # https://<team-name>.cloudflareaccess.com
pnpm exec wrangler secret put ACCESS_POLICY_AUD    # AUD tag
pnpm exec wrangler secret put ALLOWED_EMAILS       # you@example.com（カンマ区切りで複数可）
pnpm deploy
```

これらは環境固有の値なのでリポジトリには置かず、`wrangler.jsonc` には
`secrets.required` として**名前だけ**を宣言している。名前を宣言しておくことで
`wrangler types` の型生成が通り、未登録のまま `wrangler deploy` すると
不足している secret 名を挙げて失敗する。

`ALLOWED_EMAILS` は Access のポリシー側で既に絞っているなら二重チェックにあたる
（コード上は空文字なら全許可）。ただし secret 未登録だとデプロイが通らないので、
絞らない場合も自分のアドレスを入れておくのが素直。

> plaintext の `vars` は `wrangler deploy` のたびに config の内容で上書きされるが、
> secret はデプロイでは削除されない。ダッシュボードで値を管理するのは避けること。

### 7. 動作確認

```sh
curl -s https://stsh.example.com/api/me      # ブラウザでログイン後、Cookie 付きで
```

## 制限

- 1 ファイル 900 KB、1 stash 合計 4 MB、最大 50 ファイル。D1 の 1 行 1 MB 制限に由来する。
  これを超えるサイズを扱うなら、本文だけ R2 に逃がすのが素直な拡張になる。
- 検索はタイトル・説明・ファイル名が対象。D1 の LIKE パターンは 50 バイト上限のため
  クエリは 40 文字で切り詰められる。
- 閲覧画面では 200 KB を超えるファイルはハイライトせず素の `<pre>` で表示し、
  2 MB を超える分は表示を打ち切る（全文は Raw から取得する）。
