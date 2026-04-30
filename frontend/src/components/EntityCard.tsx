import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import type { ReactNode } from 'react';

export interface EntityCardStat {
  label?: string;
  icon: ReactNode;
  value: number | string;
}

interface EntityCardProps {
  to: string;
  title: string;
  description?: string | null;
  chips?: ReactNode;
  stats?: EntityCardStat[];
  footerRight?: ReactNode;
}

/**
 * Shared card used by the Projects list (Customer/Member dashboard) and
 * the Companies list (Super Admin dashboard). Matches the existing
 * `.project-card` styles so both views look identical.
 */
export function EntityCard({
  to,
  title,
  description,
  chips,
  stats,
  footerRight,
}: EntityCardProps) {
  const showDescription =
    description && description.trim() && description !== 'x';

  return (
    <Link to={to} className="project-card">
      <div className="project-card-meta">
        {chips}
        <ArrowUpRight size={16} className="project-card-go" aria-hidden="true" />
      </div>
      <h3>{title}</h3>
      {showDescription ? (
        <p>{description}</p>
      ) : (
        <p className="project-card-placeholder">No description yet.</p>
      )}
      {(stats || footerRight) && (
        <div className="project-card-footer">
          <div className="project-stats">
            {stats?.map((stat, i) => (
              <span key={i} title={stat.label}>
                {stat.icon}
                {stat.value}
              </span>
            ))}
          </div>
          {footerRight}
        </div>
      )}
    </Link>
  );
}
