import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LogIn, ShieldCheck, FileSearch, BarChart3 } from 'lucide-react';
import { useAuth } from '../auth';

export function LoginPage() {
  const { isAuthenticated, isLoading, login, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fallback = (location.state as { returnTo?: string })?.returnTo;

  useEffect(() => {
    if (isAuthenticated && !isLoading && user) {
      const target =
        fallback ??
        (user.platformRole === 'SUPER_ADMIN' ? '/admin/companies' : '/dashboard');
      navigate(target, { replace: true });
    }
  }, [isAuthenticated, isLoading, user, fallback, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const loggedIn = await login(email.trim(), password);
      const target =
        fallback ??
        (loggedIn.platformRole === 'SUPER_ADMIN' ? '/admin/companies' : '/dashboard');
      navigate(target, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">

      {/* ── Left panel ──────────────────────────────────────────────── */}
      <div className="login-left">
        {/* Animated background orbs */}
        <span className="login-orb login-orb-1" aria-hidden="true" />
        <span className="login-orb login-orb-2" aria-hidden="true" />
        <span className="login-orb login-orb-3" aria-hidden="true" />

        <div className="login-left-inner">
          <div className="login-brandmark">
            <span className="mark" aria-hidden="true" />
            <span className="wordmark">DealDiligence</span>
          </div>

          <div className="login-hero">
            <h1>
              Due diligence,<br />
              written by AI.
            </h1>
            <p>
              Upload a data room. Claude reads every document end-to-end,
              produces CUAD-aligned fact sheets, scores risk, and answers
              questions in natural language.
            </p>
          </div>

          <ul className="login-features">
            <li>
              <FileSearch size={15} aria-hidden="true" />
              End-to-end document extraction &amp; clause coverage
            </li>
            <li>
              <BarChart3 size={15} aria-hidden="true" />
              Portfolio risk scoring with confidence ratings
            </li>
            <li>
              <ShieldCheck size={15} aria-hidden="true" />
              Folder-scoped access for SME reviewers
            </li>
          </ul>
        </div>
      </div>

      {/* ── Right panel ─────────────────────────────────────────────── */}
      <div className="login-right">
        <span className="login-right-orb" aria-hidden="true" />

        <div className="login-container">
          <div className="login-brandmark login-brandmark-mobile">
            <span className="mark" aria-hidden="true" />
            <span className="wordmark">DealDiligence</span>
          </div>

          <div className="login-form-header">
            <h2>Sign in</h2>
            <p>Enter your credentials to continue</p>
          </div>

          <form className="login-content" onSubmit={handleSubmit}>
            <label className="login-field">
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                required
              />
            </label>
            <label className="login-field">
              <span>Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            {error && <p className="login-error">{error}</p>}
            <button className="login-button" type="submit" disabled={submitting}>
              <LogIn size={18} />
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
