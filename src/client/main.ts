import { mount } from 'svelte'
import App from './App.svelte'
import './app.css'
import { loadSession } from './lib/session.svelte'

void loadSession()

const target = document.getElementById('app')
if (!target) throw new Error('#app mount point is missing')

export default mount(App, { target })
