import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

/**
 * 404 Not Found page
 */
export function NotFoundPage() {
  return (
    <div className="not-found-page">
      <div className="not-found-container">
        <h1>404</h1>
        <h2>Page Not Found</h2>
        <p>The page you're looking for doesn't exist or has been moved.</p>
        <Link to="/dashboard">
          <ArrowLeft size={16} />
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
