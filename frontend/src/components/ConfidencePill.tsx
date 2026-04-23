import { ShieldCheck, ShieldAlert, Shield, ShieldQuestion } from 'lucide-react';
import { confidenceBand, type ConfidenceBand } from '../types/api';

interface Props {
  score: number | null | undefined;
  reason?: string | null;
  /** Render as a small pill (default) or a larger card-style block. */
  size?: 'sm' | 'lg';
}

const BAND_STYLE: Record<ConfidenceBand, { label: string; bg: string; fg: string; Icon: React.ElementType }> = {
  HIGH: {
    label: 'High',
    bg: 'var(--risk-low-bg)',
    fg: 'var(--risk-low)',
    Icon: ShieldCheck,
  },
  GOOD: {
    label: 'Good',
    bg: 'var(--color-primary-light)',
    fg: 'var(--color-primary)',
    Icon: Shield,
  },
  MODERATE: {
    label: 'Moderate',
    bg: 'var(--risk-med-bg)',
    fg: 'var(--risk-med)',
    Icon: ShieldAlert,
  },
  LOW: {
    label: 'Low',
    bg: 'var(--risk-high-bg)',
    fg: 'var(--risk-high)',
    Icon: ShieldAlert,
  },
  UNKNOWN: {
    label: 'N/A',
    bg: 'var(--bg-tertiary)',
    fg: 'var(--text-tertiary)',
    Icon: ShieldQuestion,
  },
};

export function ConfidencePill({ score, reason, size = 'sm' }: Props) {
  const band = confidenceBand(score);
  const meta = BAND_STYLE[band];
  const Icon = meta.Icon;
  const display = score == null ? '—' : `${score}%`;
  const tooltip =
    reason && reason.length > 0
      ? `${meta.label} confidence (${display}) — ${reason}`
      : `${meta.label} confidence: ${display}`;

  if (size === 'lg') {
    return (
      <div
        title={tooltip}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 'var(--space-3)',
          padding: 'var(--space-2) var(--space-3)',
          background: meta.bg,
          color: meta.fg,
          borderRadius: 'var(--radius-md)',
          fontSize: 'var(--text-sm)',
          fontWeight: 500,
        }}
      >
        <Icon size={16} />
        <span style={{ fontFamily: 'var(--font-display)' }}>
          {display} {band !== 'UNKNOWN' && <span style={{ opacity: 0.7 }}>· {meta.label}</span>}
        </span>
      </div>
    );
  }

  return (
    <span
      title={tooltip}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px var(--space-2)',
        background: meta.bg,
        color: meta.fg,
        borderRadius: 'var(--radius-full)',
        fontSize: 'var(--text-xs)',
        fontWeight: 500,
        lineHeight: 1.4,
        border: '1px solid transparent',
        whiteSpace: 'nowrap',
      }}
    >
      <Icon size={11} />
      {display}
    </span>
  );
}
