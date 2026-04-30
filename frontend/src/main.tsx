import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from './auth';
import App from './App';
import './index.css';

/**
 * Application entry point. AuthProvider sits above the router so every
 * route (including LoginPage) can read the session.
 */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>
);
