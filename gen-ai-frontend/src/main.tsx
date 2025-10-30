import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import * as Sentry from "@sentry/react"; // <-- ADD

// --- ADD SENTRY INITIALIZATION ---
Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_FRONTEND_DSN, // Get DSN from env
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
  ],
  tracesSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});
// ---------------------------------

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
