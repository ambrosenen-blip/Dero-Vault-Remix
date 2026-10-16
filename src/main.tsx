import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';

// Instrument window-level errors and unhandled promise rejections
window.addEventListener('error', (event) => {
  console.error(`[WindowError] [${new Date().toISOString()}] ${event.message} at ${event.filename}:${event.lineno}:${event.colno}`, event.error);
});

window.addEventListener('unhandledrejection', (event) => {
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
    createRoot(rootEl).render(
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    );
    console.log(`[Renderer] [${new Date().toISOString()}] React DOM root mounted successfully.`);
  } catch (err: any) {
    console.error(`[Renderer] [${new Date().toISOString()}] FATAL: createRoot render threw:`, err);
  }
}
