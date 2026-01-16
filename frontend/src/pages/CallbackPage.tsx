import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { authService, useApiClientInit } from '../api';

/**
 * Auth0 callback page - handles post-login redirect
 * Syncs user with backend after successful Auth0 login
 */
export function CallbackPage() {
  const { isAuthenticated, isLoading, error } = useAuth();
  const navigate = useNavigate();
  const [syncError, setSyncError] = useState<string | null>(null);

  // Initialize API client with token getter (needed since CallbackPage is outside AppLayout)
  useApiClientInit();

  useEffect(() => {
    async function syncUser() {
      if (isAuthenticated && !isLoading) {
        try {
          // Sync user with backend
          await authService.getCurrentUser();
          // Redirect to dashboard after successful sync
          navigate('/dashboard', { replace: true });
        } catch (err) {
          console.error('Failed to sync user with backend:', err);
          setSyncError('Failed to complete login. Please try again.');
        }
      }
    }

    syncUser();
  }, [isAuthenticated, isLoading, navigate]);

  if (error) {
    return (
      <div className="callback-page">
        <div className="callback-container">
          <h2>Authentication Error</h2>
          <p className="error-message">{error.message}</p>
          <button onClick={() => navigate('/login')}>Try Again</button>
        </div>
      </div>
    );
  }

  if (syncError) {
    return (
      <div className="callback-page">
        <div className="callback-container">
          <h2>Login Error</h2>
          <p className="error-message">{syncError}</p>
          <button onClick={() => navigate('/login')}>Try Again</button>
        </div>
      </div>
    );
  }

  return (
    <div className="callback-page">
      <div className="callback-container">
        <div className="loading-spinner" />
        <p>Completing login...</p>
      </div>
    </div>
  );
}
