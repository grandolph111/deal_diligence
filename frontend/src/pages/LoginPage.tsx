import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import { useAuth } from '../auth';

/**
 * Login page - redirects to Auth0 login
 */
export function LoginPage() {
  const { isAuthenticated, isLoading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Get the return URL from state or default to dashboard
  const returnTo = (location.state as { returnTo?: string })?.returnTo || '/dashboard';

  useEffect(() => {
    // If already authenticated, redirect to dashboard
    if (isAuthenticated && !isLoading) {
      navigate(returnTo, { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate, returnTo]);

  const handleLogin = () => {
    login(returnTo);
  };

  if (isLoading) {
    return (
      <div className="login-page">
        <div className="login-container">
          <div className="loading-spinner" />
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <h1>DealDiligence</h1>
          <p>M&A due diligence platform</p>
        </div>
        <div className="login-content">
          <button className="login-button" onClick={handleLogin}>
            <LogIn size={18} />
            Sign In
          </button>
          <p className="login-hint">
            Sign in with your account to access your projects
          </p>
        </div>
      </div>
    </div>
  );
}
