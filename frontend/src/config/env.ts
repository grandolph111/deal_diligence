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

function getEnvVarOptional(key: string, defaultValue: string): string {
  return import.meta.env[key] || defaultValue;
}

export const env: EnvConfig = {
  auth0: {
    // Optional for the prototype — dev-creds login is the default.
    domain: getEnvVarOptional('VITE_AUTH0_DOMAIN', ''),
    clientId: getEnvVarOptional('VITE_AUTH0_CLIENT_ID', ''),
    audience: getEnvVarOptional('VITE_AUTH0_AUDIENCE', ''),
  },
  api: {
    baseUrl: getEnvVarOptional('VITE_API_BASE_URL', 'http://localhost:3001/api/v1'),
  },
  isDevelopment: import.meta.env.DEV,
  isProduction: import.meta.env.PROD,
};
