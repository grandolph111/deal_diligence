import { useRef } from 'react';
import { useAuth } from '../../auth';
import { apiClient } from '../client';

/**
 * Hook to initialize the API client with the token getter
 * Must be called once at app startup (inside Auth0Provider)
 *
 * Sets the token getter synchronously to ensure it's available
 * before any child components try to make API calls.
 */
export function useApiClientInit(): boolean {
  const { getAccessToken, isLoading, logout } = useAuth();
  const initializedRef = useRef(false);

  // Set token getter synchronously (not in useEffect) to ensure
  // it's available before any child effects run
  if (!initializedRef.current && !isLoading) {
    apiClient.setTokenGetter(getAccessToken);
    // A stored session the server no longer accepts must end here rather than
    // leaving the app "logged in" while every request 401s. Sessions now expire
    // and are signed, so this is a normal end-of-session path, not just an
    // error case.
    apiClient.setUnauthorizedHandler(() => logout());
    initializedRef.current = true;
  }

  return apiClient.isReady();
}
