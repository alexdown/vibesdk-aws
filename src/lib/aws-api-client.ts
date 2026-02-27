/**
 * AWS API Client Adapter
 * Wraps API calls to work with AWS Lambda backend + Cognito auth
 */

import { awsConfig, isAwsBackend } from './aws-config';
import { cognitoAuth } from './cognito-auth';

class AwsApiClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = awsConfig.apiUrl;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = cognitoAuth.getAccessToken();
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      // Try refresh
      const refreshed = await cognitoAuth.refreshTokens();
      if (refreshed) {
        headers['Authorization'] = `Bearer ${refreshed.accessToken}`;
        const retryResponse = await fetch(`${this.baseUrl}${endpoint}`, {
          ...options,
          headers,
        });
        if (retryResponse.ok) {
          return retryResponse.json();
        }
      }
      throw new Error('Unauthorized');
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // User endpoints
  async getUser() {
    return this.request('/user');
  }

  async updateUser(data: { displayName?: string; preferences?: Record<string, unknown> }) {
    return this.request('/user', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // Apps endpoints
  async getApps() {
    return this.request('/apps');
  }

  async getApp(appId: string) {
    return this.request(`/apps/${appId}`);
  }

  async createApp(data: { title: string; description?: string }) {
    return this.request('/apps', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateApp(appId: string, data: Record<string, unknown>) {
    return this.request(`/apps/${appId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteApp(appId: string) {
    return this.request(`/apps/${appId}`, {
      method: 'DELETE',
    });
  }

  // Auth endpoints (for Cognito)
  async getAuthProviders() {
    return {
      data: {
        providers: {
          google: true,
          github: false,
          email: true,
        },
      },
    };
  }

  async getProfile() {
    const user = cognitoAuth.parseIdToken();
    if (!user) {
      throw new Error('Not authenticated');
    }
    return {
      data: {
        user: {
          id: user.sub,
          email: user.email,
          displayName: user.name,
          avatarUrl: user.picture,
        },
      },
    };
  }

  async logout() {
    cognitoAuth.logout();
    return { data: { message: 'Logged out' } };
  }
}

export const awsApiClient = new AwsApiClient();

// Factory to get the right client based on backend
export function getApiClient() {
  if (isAwsBackend()) {
    return awsApiClient;
  }
  // Return original client for Cloudflare
  return null;
}
