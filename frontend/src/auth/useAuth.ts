import { useCallback, useContext } from 'react';
import { AuthContext } from './AuthProvider';

/**
 * Dev-creds auth hook backed by AuthContext. Matches the shape the rest of
 * the app expects (isAuthenticated, user, getAccessToken, login, logout).
 */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within <AuthProvider>');
  }

  const { user, token, isAuthenticated, isLoading, error, login, logout } = ctx;

  const getAccessToken = useCallback(async (): Promise<string> => {
    if (!token) {
      throw new Error('Not authenticated');
    }
    return token;
  }, [token]);

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
