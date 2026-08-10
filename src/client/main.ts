import { mount } from 'svelte'
import App from './App.svelte'
import './app.css'
// Imported for its side effect: starts the identity lookup before the first render.
import './lib/session.svelte'

const target = document.getElementById('app')
if (!target) throw new Error('#app mount point is missing')

export default mount(App, { target })
