import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/plus-jakarta-sans'
import '@fontsource-variable/sora'
import './index.css'
import './lib/theme'
import { initAuth } from './lib/auth'
import App from './App.tsx'

void initAuth().then(() => {
  createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
})
