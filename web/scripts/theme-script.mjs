import { createHash } from 'node:crypto'

// Inline so the theme class is set before first paint (no flash). Astro does not hash
// `is:inline` scripts, so astro.config.mjs adds this script's hash to script-src.
export const themeScript = `try{var s=localStorage.getItem('theme');if(s==='dark'||(s!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}`

export const themeScriptHash = `sha256-${createHash('sha256').update(themeScript).digest('base64')}`
