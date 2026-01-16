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
  const { getAccessToken, isLoading } = useAuth();
  const initializedRef = useRef(false);

  // Set token getter synchronously (not in useEffect) to ensure
  // it's available before any child effects run
  if (!initializedRef.current && !isLoading) {
    apiClient.setTokenGetter(getAccessToken);
    initializedRef.current = true;
  }

  return apiClient.isReady();
}
