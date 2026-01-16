# Frontend Security Measures

This document outlines the security measures implemented in the DealDiligence.ai frontend.

## Authentication Security

### Auth0 Integration
- **OAuth 2.0 with PKCE**: Using Auth0's React SDK which implements PKCE (Proof Key for Code Exchange) by default
- **Refresh Tokens**: Enabled via `useRefreshTokens={true}` for secure token renewal
- **Secure Token Storage**: Using `cacheLocation="localstorage"` with Auth0's built-in security measures
- **Audience Validation**: API calls require the correct audience parameter

### Protected Routes
- All authenticated routes are wrapped with `ProtectedRoute` component
- Unauthenticated users are redirected to login
- Return URL is preserved for post-login redirect

## API Security

### JWT Token Handling
- Tokens are obtained via Auth0's `getAccessTokenSilently()` method
- Tokens are attached to API requests via `Authorization: Bearer` header
- Token refresh is handled automatically by Auth0 SDK

### Request Security
- **Content-Type Headers**: All requests use `application/json`
- **URL Encoding**: Query parameters are URL-encoded to prevent injection attacks
- **Error Message Sanitization**: Internal errors don't leak sensitive information

### Error Handling
- API errors return structured responses with status codes
- Token errors result in authentication required message (no sensitive details)
- Network errors are caught and handled gracefully

## XSS Prevention

### React's Built-in Protection
- React automatically escapes values embedded in JSX
- No use of `dangerouslySetInnerHTML`

### Content Security
- User data is always rendered through React's safe rendering pipeline
- No direct DOM manipulation with user-controlled data

## Environment Variables

### Client-Side Variables
- Only `VITE_*` prefixed variables are exposed to the client
- Sensitive values (API keys, secrets) should never be stored in frontend env vars
- Environment variables are validated at startup

```
VITE_AUTH0_DOMAIN      # Auth0 tenant domain (public)
VITE_AUTH0_CLIENT_ID   # Auth0 client ID (public, SPA)
VITE_AUTH0_AUDIENCE    # API audience identifier (public)
VITE_API_BASE_URL      # Backend API URL (public)
```

## Security Checklist

- [x] Auth0 with PKCE for secure authentication
- [x] JWT tokens stored securely by Auth0 SDK
- [x] Protected routes require authentication
- [x] API client validates and attaches tokens
- [x] Query parameters are URL-encoded
- [x] Error messages don't expose sensitive data
- [x] No secrets in client-side code
- [x] React's XSS protection utilized
- [x] HTTPS enforcement (production)
- [x] CORS configured on backend for allowed origins

## Production Recommendations

1. **HTTPS Only**: Ensure all production traffic uses HTTPS
2. **CSP Headers**: Configure Content-Security-Policy headers on the server
3. **Cookie Security**: If using cookies, set `Secure`, `HttpOnly`, `SameSite` flags
4. **Rate Limiting**: Implement rate limiting on the backend API
5. **Audit Logging**: Log authentication events and API access
6. **Dependency Updates**: Regularly update dependencies for security patches
