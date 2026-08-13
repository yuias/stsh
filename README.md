# stsh

個人用の gist / Pastebin ライクなテキストメモ置き場。

1 つの stash が複数ファイルを持ち、閲覧画面では Shiki によるシンタックスハイライトと
Markdown レンダリングを行う。ホスティングは Cloudflare Workers + D1、認証は
Cloudflare Access に委譲する（アプリ自身は資格情報を一切扱わず、ログイン画面も
Access のものを使う）。

## 技術構成

| 領域             | 採用                                                     |
| ---------------- | -------------------------------------------------------- |
| Backend          | Hono on Cloudflare Workers                                |
| Database         | Cloudflare D1 (SQLite)                                    |
| Frontend         | Svelte 5 (runes) / Vite 8                                 |
| Highlight        | Shiki（文法は言語ごとに遅延ロード）                       |
| Markdown         | marked + DOMPurify                                        |
| Auth             | Cloudflare Access の JWT (`Cf-Access-Jwt-Assertion`) 検証 |
| Login methods    | Google OAuth / One-time PIN（Access 側で選択）            |
| Package manager  | pnpm                                                      |

Worker と静的アセットは 1 つの Worker にまとまっており、デプロイは `wrangler deploy` 一発。
`@cloudflare/vite-plugin` により、ローカル開発でも本番と同じ workerd 上で Worker が動作する。

### ディレクトリ

```
src/
├── shared/     Worker と Client で共有する型・言語判定
├── worker/     Hono アプリ（API・raw 配信・Access JWT 検証）
└── client/     Svelte SPA
    └── locales/  UI の文言カタログ
migrations/     D1 のスキーマ
```

## i18n

デフォルトは英語で、日本語を同梱している。初回は `navigator.languages`
（サーバーが受け取る `Accept-Language` と同じ優先順位）から選び、ヘッダーの
セレクタで手動切り替えができる。手動選択は localStorage に保存され、「自動」に
戻すとブラウザの設定に従う。

`locales/en.ts` が型のソースで、他のロケールは `Messages` として型付けされる。
つまり**翻訳漏れやキーのタイプミスはコンパイルエラーになる**。パラメータを取る
文言は関数として持たせてあり、複数形の作り方や語順を各言語の側で決められる。

日付・相対時刻・数値は現在のロケールの `Intl` で整形する。エラー表示は確定した
文字列ではなく描画関数を保持しているので、表示中に言語を切り替えても追従する。

言語を追加するときは `locales/<code>.ts` を作り、`i18n.svelte.ts` の `LOCALES`
に追加する。カタログを埋め忘れれば `pnpm check` が落ちる。

なお **Worker が返すバリデーションエラーは英語のまま**である（超過バイト数などの
具体値を含むため）。よく起きるファイルサイズ超過だけは、送信前にクライアント側でも
検査してローカライズ済みの文言を出している。

## テーマ

配色は Light / Dark / 自動の 3 状態で、ヘッダーのアイコンをクリックするたびに
自動 → Light → Dark の順に切り替わる。選択は localStorage に保存され、「自動」に
戻すと OS の設定（`prefers-color-scheme`）に従う。

パレットは `app.css` の `:root` に `light-dark()` で両方の色を並べて持たせてある。
`light-dark()` は使用中の `color-scheme` を見て値を選ぶので、**手動選択は
`color-scheme` を固定するだけでよい**。これを `:root[data-theme]` が行い、属性が
無い状態が「自動」にあたる。Shiki も両テーマを CSS 変数で出力しているので、
同じ仕組みに乗せてあり、切り替えでハイライトし直す必要はない。

保存済みの選択は `index.html` のインラインスクリプトが初回描画より前に適用する。
バンドルの読み込みを待つと、OS 設定と逆のテーマが一瞬見えてしまうため。

## ログイン方法

認証は Access のログインページが担当し、アプリはそこへ誘導するだけである。
アカウントに複数の IdP を有効にしておくと、ログインページに選択肢が並ぶ
（[Google OAuth の設定](#5-ログイン方法-idp-を設定)を参照）。

ヘッダーのリンクはどちらも Cloudflare がエッジで応答するもので、Worker には届かない。

| 状態     | リンク   | 遷移先                  | 効果                                       |
| -------- | -------- | ----------------------- | ------------------------------------------ |
| 匿名     | Sign in  | `/`                     | 保護された `/` が Access のログインを起こす |
| ログイン済 | Sign out | `/cdn-cgi/access/logout` | セッションを破棄する（ログイン方法の変更に使う） |

Access は最後に成功した認証方法で identity を評価するため、PIN から Google へ
切り替えるにはいったん Sign out する必要がある。ローカル開発では Access が
前段にいない（どちらの URL も存在しない）ので、このリンクは出ない。

どちらの方法で入っても Worker が見るのは JWT の `email` claim なので、
`ALLOWED_EMAILS` や stash の所有者はログイン方法に依存しない。

### 受け付けられないセッション

**Access が通すのに Worker が拒む**中間状態がある。署名鍵のローテーションや
team domain のリネーム後、ブラウザに残った cookie は Access から見れば有効なまま
なので `/` は普通に配信されるが、token の `iss` は古いままなので `auth.ts` の
issuer 照合で落ちる。結果、Access 的にはログイン済み・アプリ的には未認証になる。

再読み込みしても Access は同じ cookie を通すだけなので直らない。**ログアウトだけが
脱出路**である。そのため `resolveAuth` は「token 無し」と「token はあるが拒否」を
区別し、後者では `/api/me` が `stale: true` を、保護 API が `session_stale` を返す。
UI はこの状態でログインではなくログアウトのリンクを出す。

## ルーティングと公開範囲

`run_worker_first` で `/api/*` と `/raw/*` だけが Worker に到達し、それ以外は静的アセット
（未マッチは `index.html` へフォールバック）になる。

| パス                       | 認証                         | 用途                       |
| -------------------------- | ---------------------------- | -------------------------- |
| `/`, `/new`, `/s/:id/edit` | 必須                         | 一覧・編集 UI              |
| `/api/stashes/*`, `/api/me`| 必須                         | CRUD・identity             |
| `/s/:id`                   | **Bypass**                   | 閲覧ページ（SPA）          |
| `/api/public/stashes/:id`  | **Bypass**                   | 閲覧ページが読む API       |
| `/raw/:id[/:filename]`     | **Bypass**                   | 生テキスト                 |
| `/assets/*`, `/favicon.svg`| **Bypass**                   | SPA のバンドル             |

Bypass 経路は Access を通さずに到達しうるため、Worker 側でも
`visibility = 'public'` の stash 以外は 404 を返して二重に防いでいる。private な stash の
存在自体も匿名クライアントには漏らさない。

**Bypass されたリクエストに Cloudflare は identity token を付けない。** つまり
ログイン済みのユーザーであっても `/api/public/*` 上では匿名として扱われる。そのため
閲覧ページは、セッションが確立していれば保護側の `/api/stashes/:id` を使い、
匿名のときだけ `/api/public/stashes/:id` にフォールバックする（`ViewPage.svelte`）。

Access アプリケーションはホスト全体を守るものと、上記 Bypass パスをまとめた
`destinations` を持つものの 2 つ。より具体的なパスを持つ後者が先に評価される。
なお Worker の workers.dev ルートは Access の保護外になるため `workers_dev: false` で
必ず無効化すること。

## ローカル開発

```sh
pnpm install
pnpm setup        # テンプレートから wrangler.jsonc と .dev.vars を作る
pnpm db:migrate   # ローカル D1 (.wrangler/state) にスキーマ適用
pnpm dev          # http://localhost:5173
```

`pnpm setup` が作る 2 ファイルはどちらも環境固有の値を持つため git 管理外で、
テンプレート（`wrangler.example.jsonc` / `.dev.vars.example`）だけがコミットされている。
既存ファイルは上書きしないので、いつ実行しても安全。
ローカル開発はテンプレートの値のままで動く。

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
このファイルは git 管理外なので、値がリポジトリに入ることはない。

> `wrangler.jsonc` を編集したとき、環境固有でない変更（compatibility_date、
> ルーティング、バインディング追加など）は `wrangler.example.jsonc` にも反映すること。
> wrangler は設定ファイル内での環境変数展開をサポートしないため、
> 1 ファイルで両立させることはできない。

### 3. 本番 D1 にマイグレーション適用

```sh
pnpm db:migrate:remote
```

### 4. デプロイ

```sh
pnpm deploy
```

この時点では Access 変数が未設定なので、API は 500 を返す（意図的に fail closed）。

### 5. ログイン方法 (IdP) を設定

ログイン方法はアカウント単位の設定で、アプリケーションより先に用意しておく。
Zero Trust ダッシュボード > **Integrations** > **Identity providers** で追加する。

One-time PIN だけでも運用できるが、毎回メールを開くことになる。Google OAuth を
足しておくと、ログインページに両方が並んで好きな方を選べる（PIN は他人を一時的に
招く用途にも残しておくと便利）。

Google を追加するには、先に Google Cloud console 側で OAuth クライアントを作る。

1. プロジェクトを作り、**APIs & Services** > **Credentials** > **Configure Consent Screen**
   で audience は **External**、アプリ名とサポート用メールアドレスを入れる。
2. **Create OAuth client** で application type に **Web application** を選ぶ。
3. Authorized JavaScript origins: `https://<team-name>.cloudflareaccess.com`
4. Authorized redirect URIs: `https://<team-name>.cloudflareaccess.com/cdn-cgi/access/callback`
5. 発行された **Client ID** と **Client Secret** を控える。

Zero Trust に戻り、**Add new identity provider** > **Google** で控えた 2 つを入れて保存。
入力欄の **App ID** が Client ID にあたる。保存後の **Test** で疎通を確認できる。

> アプリケーション側の **Login methods** は、既定でアカウントのすべての IdP を
> 受け付ける。ここを 1 つに絞ったうえで **Instant Auth**
> (`auto_redirect_to_identity`) を有効にすると選択画面が飛ばされるので、
> 選ばせたいなら既定のままにしておくこと。

Google アカウントのメールアドレスが One-time PIN で使うものと同じであれば、
どちらで入っても Worker から見える identity は変わらない。

### 6. Cloudflare Access を設定

Zero Trust ダッシュボード > Access > Applications で **Self-hosted** アプリケーションを作る。

まず本体を保護するアプリケーション:

- Application domain: `stsh.example.com`（Worker の Custom Domain、または `*.workers.dev`）
- Policy: Allow / Emails = 自分のアドレス

次に、閲覧系を素通しにする Bypass アプリケーションを 1 つ作る。`destinations` に
パスを列挙でき、Access はより具体的なパスを優先するため、これが上のアプリより先に
評価される。

- Policy: Bypass / Everyone
- Destinations:
  - `stsh.example.com/s/*`
  - `stsh.example.com/raw/*`
  - `stsh.example.com/api/public/*`
  - `stsh.example.com/assets/*`
  - `stsh.example.com/favicon.svg`

公開リンクを一切使わない運用なら、この Bypass アプリは作らなくてよい。その場合
`visibility` は単なるラベルとして残る。

### 7. Access の値を secret として登録

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

### 8. 動作確認

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
