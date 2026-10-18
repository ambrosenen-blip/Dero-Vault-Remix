import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { TrayPopoverApp } from './components/TrayPopoverApp.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';

// Instrument window-level errors and unhandled promise rejections (ignoring expected Vite HMR WebSocket errors)
window.addEventListener('error', (event) => {
  const msg = String(event.message || '');
  if (msg.includes('WebSocket') || msg.includes('vite') || msg.includes('ws://') || msg.includes('wss://')) {
    event.preventDefault();
    return;
  }
  console.error(`[WindowError] [${new Date().toISOString()}] ${event.message} at ${event.filename}:${event.lineno}:${event.colno}`, event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  const reasonStr = String(event.reason?.message || event.reason || '');
  if (reasonStr.includes('WebSocket') || reasonStr.includes('vite') || reasonStr.includes('ws://') || reasonStr.includes('wss://')) {
    event.preventDefault();
    return;
  }
  console.error(`[UnhandledRejection] [${new Date().toISOString()}] Reason:`, event.reason);
});

console.log(`[Renderer] [${new Date().toISOString()}] Initializing React DOM root on #root...`);

const rootEl = document.getElementById('root');
if (!rootEl) {
  console.error(`[Renderer] [${new Date().toISOString()}] FATAL: #root element not found in DOM!`);
  document.body.innerHTML = `
    <div style="background:#020617;color:#fff;font-family:sans-serif;padding:24px;">
      <h2>Dero Vault Initialization Error</h2>
      <p>Could not find root element '#root' in DOM.</p>
    </div>
  `;
} else {
  try {
    const isTrayMode = window.location.hash === '#tray' || window.location.search.includes('mode=tray');
    createRoot(rootEl).render(
      <ErrorBoundary>
        {isTrayMode ? <TrayPopoverApp /> : <App />}
      </ErrorBoundary>
    );
    console.log(`[Renderer] [${new Date().toISOString()}] React DOM root mounted successfully (mode=${isTrayMode ? 'tray' : 'main'}).`);
  } catch (err: any) {
    console.error(`[Renderer] [${new Date().toISOString()}] FATAL: createRoot render threw:`, err);
  }
}
