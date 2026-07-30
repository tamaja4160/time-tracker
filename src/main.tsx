import { StrictMode, useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './ui/App';
import { PrivacyPage } from './ui/PrivacyPage';
import { TermsPage } from './ui/TermsPage';

function Router() {
  const [hash, setHash] = useState(() => window.location.hash);

  useEffect(() => {
    const handler = () => setHash(window.location.hash);
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  if (hash === '#/privacy') return <PrivacyPage />;
  if (hash === '#/terms') return <TermsPage />;
  return <App />;
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <Router />
  </StrictMode>,
);
