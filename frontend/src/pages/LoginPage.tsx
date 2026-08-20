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
            <div className="login-hero-head">
              <h1>
                Due diligence,<br />
                written by AI.
              </h1>

            {/* Paper being written + marked up */}
            <div className="login-paper" aria-hidden="true">
              <svg viewBox="0 0 132 150" fill="none" xmlns="http://www.w3.org/2000/svg">
                {/* sheet behind */}
                <rect
                  className="paper-sheet paper-sheet-back"
                  x="6" y="17" width="84" height="110" rx="7"
                />
                {/* front sheet */}
                <rect
                  className="paper-sheet paper-sheet-front"
                  x="12" y="8" width="88" height="116" rx="7"
                />

                {/* highlight sweep over the marked-up line */}
                <rect className="paper-highlight" x="22" y="60" width="68" height="11" rx="2.5" />

                {/* title rule */}
                <line className="paper-line paper-title" pathLength={1} x1="24" y1="26" x2="64" y2="26" />

                {/* body rules, written in sequence */}
                <line className="paper-line" style={{ animationDelay: '0.5s' }} pathLength={1} x1="24" y1="42" x2="88" y2="42" />
                <line className="paper-line" style={{ animationDelay: '0.8s' }} pathLength={1} x1="24" y1="53" x2="78" y2="53" />
                <line className="paper-line paper-line-marked" style={{ animationDelay: '1.1s' }} pathLength={1} x1="24" y1="65.5" x2="86" y2="65.5" />
                <line className="paper-line" style={{ animationDelay: '1.4s' }} pathLength={1} x1="24" y1="78" x2="70" y2="78" />
                <line className="paper-line" style={{ animationDelay: '1.7s' }} pathLength={1} x1="24" y1="89" x2="84" y2="89" />
                <line className="paper-line" style={{ animationDelay: '2s' }} pathLength={1} x1="24" y1="100" x2="58" y2="100" />

                {/* margin tick beside the marked line */}
                <path className="paper-tick" pathLength={1} d="M110 57 L110 75" />

                {/* approval badge */}
                <g className="paper-badge">
                  <circle cx="100" cy="114" r="13" />
                  <path d="M94 114.5 L98.5 119 L106.5 109.5" pathLength={1} />
                </g>
              </svg>
            </div>
            </div>
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
