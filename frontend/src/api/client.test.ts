import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiClient, ApiClientError } from './client';

describe('ApiClient', () => {
  const mockFetch = global.fetch as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch.mockReset();
    // Set up a mock token getter
    apiClient.setTokenGetter(async () => 'mock-jwt-token');
  });

  describe('GET requests', () => {
    it('should make GET request with auth header', async () => {
      const mockData = { id: '1', name: 'Test Project' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockData,
      });

      const result = await apiClient.get('/projects/1');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/projects/1',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer mock-jwt-token',
          }),
        })
      );
      expect(result).toEqual(mockData);
    });

    it('should handle query parameters correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => [],
      });

      await apiClient.get('/tasks', { status: 'TODO', priority: 'HIGH' });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/tasks?status=TODO&priority=HIGH',
        expect.any(Object)
      );
    });

    it('should filter out undefined query parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => [],
      });

      await apiClient.get('/tasks', { status: 'TODO', priority: undefined });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/tasks?status=TODO',
        expect.any(Object)
      );
    });
  });

  describe('POST requests', () => {
    it('should make POST request with JSON body', async () => {
      const mockData = { id: '1', name: 'New Project' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockData,
      });

      const result = await apiClient.post('/projects', { name: 'New Project' });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/projects',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'New Project' }),
        })
      );
      expect(result).toEqual(mockData);
    });
  });

  describe('PATCH requests', () => {
    it('should make PATCH request with JSON body', async () => {
      const mockData = { id: '1', name: 'Updated Project' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockData,
      });

      const result = await apiClient.patch('/projects/1', { name: 'Updated Project' });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/projects/1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ name: 'Updated Project' }),
        })
      );
      expect(result).toEqual(mockData);
    });
  });

  describe('DELETE requests', () => {
    it('should make DELETE request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),  // 204 No Content has no JSON
      });

      await apiClient.delete('/projects/1');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/projects/1',
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });
  });

  describe('Error handling', () => {
    it('should throw ApiClientError on HTTP error with message', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          status: 'error',
          message: 'Project not found',
          code: 'NOT_FOUND',
        }),
      });

      try {
        await apiClient.get('/projects/1');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiClientError);
        expect((error as ApiClientError).message).toBe('Project not found');
        expect((error as ApiClientError).status).toBe(404);
        expect((error as ApiClientError).code).toBe('NOT_FOUND');
      }
    });

    it('should throw ApiClientError on 401 unauthorized', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          status: 'error',
          message: 'Unauthorized',
        }),
      });

      try {
        await apiClient.get('/projects');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiClientError);
        expect((error as ApiClientError).status).toBe(401);
      }
    });

    it('should throw ApiClientError on 403 forbidden', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          status: 'error',
          message: 'Forbidden',
        }),
      });

      try {
        await apiClient.delete('/projects/1');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiClientError);
        expect((error as ApiClientError).status).toBe(403);
      }
    });

    it('should handle non-JSON error responses', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        headers: new Headers({ 'content-type': 'text/plain' }),
      });

      try {
        await apiClient.get('/projects');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiClientError);
        expect((error as ApiClientError).status).toBe(500);
      }
    });

    it('should throw when token getter fails', async () => {
      apiClient.setTokenGetter(async () => {
        throw new Error('Token refresh failed');
      });

      try {
        await apiClient.get('/projects');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiClientError);
        expect((error as ApiClientError).message).toBe('Authentication required');
      }
    });
  });

  describe('Security', () => {
    it('should URL encode query parameters to prevent injection', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => [],
      });

      await apiClient.get('/tasks', { search: '<script>alert("xss")</script>' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(encodeURIComponent('<script>alert("xss")</script>')),
        expect.any(Object)
      );
    });

    it('should not expose token in error messages', async () => {
      apiClient.setTokenGetter(async () => {
        throw new Error('secret-token-info');
      });

      try {
        await apiClient.get('/projects');
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as Error).message).not.toContain('secret-token-info');
        expect((error as Error).message).toBe('Authentication required');
      }
    });
  });
});
