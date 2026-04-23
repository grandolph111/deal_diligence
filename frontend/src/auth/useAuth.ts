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

  // Check for mock auth in localStorage
  const isMockLoggedIn = localStorage.getItem('mock_auth_logged_in') === 'true';
  const finalIsAuthenticated = isAuthenticated || isMockLoggedIn;
  const finalUser = user || (isMockLoggedIn ? { sub: 'dev_user', email: 'dev@example.com', name: 'Dev User' } : null);

  /**
   * Get a valid access token for API calls
   * Automatically refreshes if expired
   */
  const getAccessToken = useCallback(async (): Promise<string> => {
    if (isMockLoggedIn) {
      return 'mock-dev-token-' + Date.now();
    }
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
  }, [getAccessTokenSilently, isMockLoggedIn]);

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
   * Logout and redirect to home page.
   * Mock-auth dev path: just clear the flag + hard-navigate home. Calling
   * auth0Logout here would redirect to a placeholder tenant (test.auth0.com)
   * and hang forever, which is the "loading" bug.
   */
  const logout = useCallback(() => {
    const wasMock = localStorage.getItem('mock_auth_logged_in') === 'true';
    localStorage.removeItem('mock_auth_logged_in');
    if (wasMock) {
      window.location.href = '/';
      return;
    }
    auth0Logout({
      logoutParams: {
        returnTo: window.location.origin,
      },
    });
  }, [auth0Logout]);

  return {
    isAuthenticated: finalIsAuthenticated,
    isLoading,
    user: finalUser,
    error,
    login,
    logout,
    getAccessToken,
  };
}
