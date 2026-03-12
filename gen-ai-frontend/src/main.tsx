
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { SharedChat } from './SharedChat.tsx'
import LandingPage from './pages/LandingPage.tsx'
import PrivacyPolicy from './pages/PrivacyPolicy.tsx'
import TermsOfService from './pages/TermsOfService.tsx'
import CookieConsent from './components/CookieConsent.tsx'
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/share/:id" element={<SharedChat />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsOfService />} />
        
        {/* Login/Signup Redirects to the Protected App */}
        <Route path="/login" element={<Navigate to="/app" replace />} />
        <Route path="/signup" element={<Navigate to="/app" replace />} />
        
        {/* Protected App Route */}
        <Route path="/app/*" element={<App />} />
        
        {/* Catch all redirect to landing */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <CookieConsent />
    </BrowserRouter>
  </StrictMode>,
)