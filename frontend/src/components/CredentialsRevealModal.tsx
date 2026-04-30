import { useState } from 'react';
import { Copy, X, Check } from 'lucide-react';

interface CredentialsRevealModalProps {
  email: string;
  password: string;
  headline?: string;
  role?: string;
  onClose: () => void;
}

/**
 * One-time reveal for a newly generated password. After dismissing, the
 * password is gone from the UI — admins use the "Regenerate password"
 * action to rotate and re-reveal.
 */
export function CredentialsRevealModal({
  email,
  password,
  headline,
  role,
  onClose,
}: CredentialsRevealModalProps) {
  const [copied, setCopied] = useState<'email' | 'password' | 'both' | null>(null);

  const copy = async (value: string, key: 'email' | 'password' | 'both') => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied(null);
    }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-card credentials-reveal">
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
        <h2>{headline ?? 'Account created'}</h2>
        {role && <p className="modal-subtitle">Role: {role}</p>}
        <p className="modal-warning">
          This password will not be shown again. Copy it now and send it to the
          new user — they can change it after logging in.
        </p>

        <div className="credentials-row">
          <label>Email</label>
          <div className="credentials-value">
            <code>{email}</code>
            <button
              type="button"
              className="icon-button"
              onClick={() => copy(email, 'email')}
              title="Copy email"
            >
              {copied === 'email' ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
        </div>

        <div className="credentials-row">
          <label>Password</label>
          <div className="credentials-value">
            <code>{password}</code>
            <button
              type="button"
              className="icon-button"
              onClick={() => copy(password, 'password')}
              title="Copy password"
            >
              {copied === 'password' ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
        </div>

        <div className="modal-actions">
          <button
            type="button"
            className="button secondary"
            onClick={() => copy(`${email} / ${password}`, 'both')}
          >
            {copied === 'both' ? 'Copied!' : 'Copy both'}
          </button>
          <button type="button" className="button primary" onClick={onClose}>
            I've saved it
          </button>
        </div>
      </div>
    </div>
  );
}
