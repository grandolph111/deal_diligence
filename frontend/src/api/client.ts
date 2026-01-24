import { env } from '../config/env';
import type { ApiError } from '../types/api';

/**
 * Custom error class for API errors
 */
export class ApiClientError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
  }
}

/**
 * Type for the token getter function
 */
type GetAccessTokenFn = () => Promise<string>;

/**
 * API Client class with typed methods
 * Handles JWT token attachment and error handling
 */
class ApiClient {
  private baseUrl: string;
  private getAccessToken: GetAccessTokenFn | null = null;

  constructor() {
    this.baseUrl = env.api.baseUrl;
  }

  /**
   * Set the token getter function (called from React context)
   */
  setTokenGetter(fn: GetAccessTokenFn) {
    this.getAccessToken = fn;
  }

  /**
   * Check if the API client is ready to make authenticated requests
   */
  isReady(): boolean {
    return this.getAccessToken !== null;
  }

  /**
   * Build headers with JWT token
   */
  private async buildHeaders(includeAuth: boolean = true): Promise<HeadersInit> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest', // CSRF protection
    };

    if (includeAuth) {
      if (!this.getAccessToken) {
        throw new ApiClientError('API client not initialized. Token getter not set.', 401);
      }
      try {
        const token = await this.getAccessToken();
        headers['Authorization'] = `Bearer ${token}`;
      } catch (error) {
        console.error('Failed to get access token for request:', error);
        throw new ApiClientError('Authentication required', 401);
      }
    }

    return headers;
  }

  /**
   * Handle API response and extract data
   */
  private async handleResponse<T>(response: Response): Promise<T> {
    // Handle non-JSON responses (e.g., 204 No Content)
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      if (!response.ok) {
        throw new ApiClientError(
          `Request failed with status ${response.status}`,
          response.status
        );
      }
      return {} as T;
    }

    const json = await response.json();

    // Handle error responses
    if (!response.ok) {
      const error = json as ApiError;
      throw new ApiClientError(
        error.message || error.error || `Request failed with status ${response.status}`,
        response.status,
        error.code
      );
    }

    // Backend returns data directly (no wrapper)
    return json as T;
  }

  /**
   * Make a GET request
   */
  async get<T>(path: string, params?: Record<string, string | undefined>): Promise<T> {
    // Build query string from params, filtering out undefined values
    let url = `${this.baseUrl}${path}`;
    if (params) {
      const filteredParams = Object.entries(params)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value!)}`);
      if (filteredParams.length > 0) {
        url += `?${filteredParams.join('&')}`;
      }
    }

    const headers = await this.buildHeaders();
    const response = await fetch(url, {
      method: 'GET',
      headers,
    });

    return this.handleResponse<T>(response);
  }

  /**
   * Make a POST request
   */
  async post<T>(path: string, body?: unknown): Promise<T> {
    const headers = await this.buildHeaders();
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    return this.handleResponse<T>(response);
  }

  /**
   * Make a PATCH request
   */
  async patch<T>(path: string, body?: unknown): Promise<T> {
    const headers = await this.buildHeaders();
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'PATCH',
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    return this.handleResponse<T>(response);
  }

  /**
   * Make a DELETE request
   */
  async delete<T>(path: string): Promise<T> {
    const headers = await this.buildHeaders();
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'DELETE',
      headers,
    });

    return this.handleResponse<T>(response);
  }

  /**
   * Make a request without authentication (for public endpoints)
   */
  async getPublic<T>(path: string): Promise<T> {
    const headers = await this.buildHeaders(false);
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'GET',
      headers,
    });

    return this.handleResponse<T>(response);
  }
}

// Export singleton instance
export const apiClient = new ApiClient();
