import { render } from 'preact';
import '@/styles/global.css';
import { App } from './App';
import { ErrorBoundary } from '@/components/ErrorBoundary';

// Don't let an unhandled rejection blank the panel (PLAN §47).
window.addEventListener('unhandledrejection', (e) => {
  if (import.meta.env.DEV) console.error('[BrowseCortex] Unhandled rejection:', e.reason);
});

render(
  <ErrorBoundary label="root">
    <App />
  </ErrorBoundary>,
  document.getElementById('app')!,
);
