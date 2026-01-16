import { useAuth0 } from '@auth0/auth0-react';
import { useCallback } from 'react';
import { env } from '../config/env';

/**
 * Custom auth hook that wraps Auth0 functionality
 * Provides typed access to authentication state and methods
 */
export function useAuth() {
  const {
    isAuthenticated,
    isLoading,
    user,
    loginWithRedirect,
    logout: auth0Logout,
    getAccessTokenSilently,
    error,
  } = useAuth0();

  /**
   * Get a valid access token for API calls
   * Automatically refreshes if expired
   */
  const getAccessToken = useCallback(async (): Promise<string> => {
    try {
      const token = await getAccessTokenSilently({
        authorizationParams: {
          audience: env.auth0.audience,
        },
      });
      return token;
    } catch (error) {
      // If token refresh fails, redirect to login
      console.error('Failed to get access token:', error);
      throw error;
    }
  }, [getAccessTokenSilently]);

  /**
   * Redirect to Auth0 login page
   */
  const login = useCallback(
    (returnTo?: string) => {
      loginWithRedirect({
        appState: { returnTo: returnTo || '/dashboard' },
      });
    },
    [loginWithRedirect]
  );

  /**
   * Logout and redirect to home page
   */
  const logout = useCallback(() => {
    auth0Logout({
      logoutParams: {
        returnTo: window.location.origin,
      },
    });
  }, [auth0Logout]);

  return {
    isAuthenticated,
    isLoading,
    user,
    error,
    login,
    logout,
    getAccessToken,
  };
}
