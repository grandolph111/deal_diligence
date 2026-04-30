import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import { env } from '../config/env';

export type PlatformRole = 'SUPER_ADMIN' | 'CUSTOMER_ADMIN' | 'MEMBER';

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  platformRole: PlatformRole;
  companyId: string | null;
  company?: {
    id: string;
    name: string;
    description: string | null;
  } | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => void;
}

// Exported so useAuth can consume it without a circular import.
export const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = 'dd_auth_session';

interface StoredSession {
  token: string;
  user: AuthUser;
}

function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed.token || !parsed.user) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveSession(session: StoredSession | null) {
  if (session) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<StoredSession | null>(() => loadSession());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    saveSession(session);
  }, [session]);

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${env.api.baseUrl}/auth/dev-login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const message = body.message || body.error || 'Login failed';
        throw new Error(message);
      }
      const data = (await res.json()) as { token: string; user: AuthUser };
      setSession({ token: data.token, user: data.user });
      return data.user;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    setSession(null);
    window.location.href = '/login';
  }, []);

  const value: AuthContextValue = useMemo(
    () => ({
      user: session?.user ?? null,
      token: session?.token ?? null,
      isAuthenticated: !!session,
      isLoading,
      error,
      login,
      logout,
    }),
    [session, isLoading, error, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
