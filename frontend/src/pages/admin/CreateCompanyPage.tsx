import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { companiesService } from '../../api';
import { CredentialsRevealModal } from '../../components/CredentialsRevealModal';

interface FormState {
  name: string;
  description: string;
  adminEmail: string;
  adminName: string;
}

interface CreatedCreds {
  companyId: string;
  email: string;
  password: string;
}

/**
 * Super Admin onboarding: create a company and its initial Customer Admin
 * user at the same time. Password is generated server-side and revealed
 * once via CredentialsRevealModal.
 */
export function CreateCompanyPage() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedCreds | null>(null);

  const [formData, setFormData] = useState<FormState>({
    name: '',
    description: '',
    adminEmail: '',
    adminName: '',
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setError('Company name is required');
      return;
    }
    if (!formData.adminEmail.trim()) {
      setError('Admin email is required');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const result = await companiesService.createCompany({
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        adminEmail: formData.adminEmail.trim(),
        adminName: formData.adminName.trim() || undefined,
      });
      setCreated({
        companyId: result.company.id,
        email: result.admin.email,
        password: result.generatedPassword,
      });
    } catch (err) {
      console.error('Failed to create company:', err);
      setError(err instanceof Error ? err.message : 'Failed to create company');
    } finally {
      setSubmitting(false);
    }
  };

  const isValid =
    formData.name.trim().length > 0 && formData.adminEmail.trim().length > 0;

  return (
    <div className="create-project-page">
      <div className="page-header">
        <Link to="/admin/companies" className="back-link">
          <ArrowLeft size={16} />
          Back to Companies
        </Link>
        <h1>New Company</h1>
        <p>
          Onboard a company and create its first Customer Admin account. A
          random password will be generated — copy it and send it to the new
          admin.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="create-project-form">
        <div className="form-card">
          <div className="form-section">
            <h2>Company</h2>
            <div className="form-group">
              <label htmlFor="name">
                Company name <span className="required">*</span>
              </label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                maxLength={255}
                placeholder="Acme Corp"
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="description">Description</label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={3}
                maxLength={2000}
                placeholder="Short description of the company"
              />
            </div>
          </div>

          <div className="form-section">
            <h2>Customer Admin</h2>
            <p className="form-hint">
              This person logs in to manage every deal for this company.
            </p>
            <div className="form-group">
              <label htmlFor="adminEmail">
                Admin email <span className="required">*</span>
              </label>
              <input
                type="email"
                id="adminEmail"
                name="adminEmail"
                value={formData.adminEmail}
                onChange={handleChange}
                placeholder="admin@acme.com"
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="adminName">Admin name</label>
              <input
                type="text"
                id="adminName"
                name="adminName"
                value={formData.adminName}
                onChange={handleChange}
                maxLength={255}
                placeholder="Jane Doe"
              />
            </div>
          </div>

          {error && <p className="error-message">{error}</p>}

          <div className="form-actions">
            <Link to="/admin/companies" className="button secondary">
              Cancel
            </Link>
            <button
              type="submit"
              className="button primary"
              disabled={!isValid || submitting}
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="spinner" /> Creating…
                </>
              ) : (
                'Create Company'
              )}
            </button>
          </div>
        </div>
      </form>

      {created && (
        <CredentialsRevealModal
          email={created.email}
          password={created.password}
          headline="Company created"
          role="Customer Admin"
          onClose={() => {
            const id = created.companyId;
            setCreated(null);
            navigate(`/admin/companies/${id}`, { replace: true });
          }}
        />
      )}
    </div>
  );
}
