/**
 * Environment configuration with validation
 * All environment variables are validated at startup to fail fast
 */

interface EnvConfig {
  auth0: {
    domain: string;
    clientId: string;
    audience: string;
  };
  api: {
    baseUrl: string;
  };
  isDevelopment: boolean;
  isProduction: boolean;
}

function getEnvVar(key: string): string {
  const value = import.meta.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getEnvVarOptional(key: string, defaultValue: string): string {
  return import.meta.env[key] || defaultValue;
}

export const env: EnvConfig = {
  auth0: {
    domain: getEnvVar('VITE_AUTH0_DOMAIN'),
    clientId: getEnvVar('VITE_AUTH0_CLIENT_ID'),
    audience: getEnvVar('VITE_AUTH0_AUDIENCE'),
  },
  api: {
    baseUrl: getEnvVarOptional('VITE_API_BASE_URL', 'http://localhost:3001/api/v1'),
  },
  isDevelopment: import.meta.env.DEV,
  isProduction: import.meta.env.PROD,
};
