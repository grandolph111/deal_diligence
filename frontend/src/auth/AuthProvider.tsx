import { Auth0Provider } from '@auth0/auth0-react';
import type { AppState } from '@auth0/auth0-react';
import { useNavigate } from 'react-router-dom';
import { env } from '../config/env';

interface AuthProviderProps {
  children: React.ReactNode;
}

/**
 * Auth0 Provider wrapper that handles authentication
 * Wraps the application with Auth0 context
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const navigate = useNavigate();

  const onRedirectCallback = (appState?: AppState) => {
    // Navigate to the intended destination after login
    // Default to dashboard if no return URL specified
    navigate(appState?.returnTo || '/dashboard');
  };

  return (
    <Auth0Provider
      domain={env.auth0.domain}
      clientId={env.auth0.clientId}
      authorizationParams={{
        redirect_uri: window.location.origin + '/callback',
        audience: env.auth0.audience,
        scope: 'openid profile email',
      }}
      onRedirectCallback={onRedirectCallback}
      cacheLocation="localstorage"
      useRefreshTokens={true}
    >
      {children}
    </Auth0Provider>
  );
}
