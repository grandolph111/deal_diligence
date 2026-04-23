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
    // If already authenticated, redirect to dashboard or stored redirect path
    if (isAuthenticated && !isLoading) {
      const storedRedirect = localStorage.getItem('mock_auth_redirect');
      const finalReturnTo = storedRedirect || returnTo;
      if (storedRedirect) {
        localStorage.removeItem('mock_auth_redirect');
      }
      navigate(finalReturnTo, { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate, returnTo]);

  const handleLogin = () => {
    // In development with mock auth, just navigate directly
    if (import.meta.env.MODE === 'development') {
      localStorage.setItem('mock_auth_logged_in', 'true');
      navigate(returnTo || '/projects', { replace: true });
    } else {
      login(returnTo);
    }
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
        <div className="login-brandmark">
          <span className="mark" aria-hidden="true" />
          <span className="wordmark">DealDiligence</span>
        </div>
        <div className="login-header">
          <h1>Due diligence,<br />written by AI.</h1>
          <p>Upload a data room. AI reads every document end-to-end, produces CUAD-aligned fact sheets, scores risk, and answers in natural language.</p>
        </div>
        <div className="login-content">
          <button className="login-button" onClick={handleLogin}>
            <LogIn size={18} />
            Sign in
          </button>
          <p className="login-hint">
            Continue with your corporate account
          </p>
        </div>
      </div>
    </div>
  );
}
