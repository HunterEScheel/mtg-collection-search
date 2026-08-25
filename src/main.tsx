import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { SharedLocationView, RESUME_SHARE_KEY } from './components/SharedLocationView.tsx'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function resolveShareId(): string | null {
  const fromUrl = new URLSearchParams(window.location.search).get('share');
  if (fromUrl && UUID_RE.test(fromUrl)) return fromUrl.toLowerCase();

  // OAuth/magic-link redirects land on the bare origin; if a share page
  // started the sign-in, resume it and put the share URL back in the bar.
  const resumed = localStorage.getItem(RESUME_SHARE_KEY);
  if (resumed && UUID_RE.test(resumed)) {
    localStorage.removeItem(RESUME_SHARE_KEY);
    const url = new URL(window.location.href);
    url.searchParams.set('share', resumed.toLowerCase());
    window.history.replaceState(null, '', url);
    return resumed.toLowerCase();
  }
  return null;
}

const shareId = resolveShareId();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {shareId ? <SharedLocationView shareId={shareId} /> : <App />}
  </StrictMode>,
)
