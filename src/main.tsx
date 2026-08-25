import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { SharedLocationView } from './components/SharedLocationView.tsx'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const shareId = new URLSearchParams(window.location.search).get('share');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {shareId && UUID_RE.test(shareId)
      ? <SharedLocationView shareId={shareId.toLowerCase()} />
      : <App />}
  </StrictMode>,
)
