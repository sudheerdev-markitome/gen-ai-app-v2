import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { SharedChat } from './SharedChat.tsx' // <-- Import the new SharedChat component
import * as Sentry from "@sentry/react";

// --- SENTRY INITIALIZATION ---
Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_FRONTEND_DSN,
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
  ],
  tracesSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});
// ---------------------------------

// --- SIMPLE ROUTING LOGIC ---
// Check if the current URL starts with "/share/"
const path = window.location.pathname;
const isSharedRoute = path.startsWith('/share/');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Conditionally render the SharedChat or the main App based on the URL */}
    {isSharedRoute ? <SharedChat /> : <App />}
  </StrictMode>,
)