/**
 * AWS Cognito Auth Adapter
 * Handles authentication via AWS Cognito instead of Cloudflare Workers
 */

import { awsConfig } from './aws-config';

interface CognitoTokens {
  idToken: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

interface CognitoUser {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
}

const TOKEN_STORAGE_KEY = 'cognito_tokens';

export class CognitoAuthAdapter {
  private tokens: CognitoTokens | null = null;

  constructor() {
    this.loadTokens();
  }

  private loadTokens() {
    try {
      const stored = localStorage.getItem(TOKEN_STORAGE_KEY);
      if (stored) {
        this.tokens = JSON.parse(stored);
      }
    } catch {
      this.tokens = null;
    }
  }

  private saveTokens(tokens: CognitoTokens) {
    this.tokens = tokens;
    localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(tokens));
  }

  private clearTokens() {
    this.tokens = null;
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }

  getLoginUrl(redirectUri: string): string {
    const { cognito } = awsConfig;
    const params = new URLSearchParams({
      client_id: cognito.clientId,
      response_type: 'code',
      scope: 'email openid profile',
      redirect_uri: redirectUri,
    });
    return `${cognito.hostedUiUrl}/login?${params}`;
  }

  getSignupUrl(redirectUri: string): string {
    const { cognito } = awsConfig;
    const params = new URLSearchParams({
      client_id: cognito.clientId,
      response_type: 'code',
      scope: 'email openid profile',
      redirect_uri: redirectUri,
    });
    return `${cognito.hostedUiUrl}/signup?${params}`;
  }

  getLogoutUrl(redirectUri: string): string {
    const { cognito } = awsConfig;
    const params = new URLSearchParams({
      client_id: cognito.clientId,
      logout_uri: redirectUri,
    });
    return `${cognito.hostedUiUrl}/logout?${params}`;
  }

  async exchangeCodeForTokens(code: string, redirectUri: string): Promise<CognitoTokens> {
    const { cognito } = awsConfig;
    const response = await fetch(`${cognito.hostedUiUrl}/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: cognito.clientId,
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to exchange code for tokens');
    }

    const data = await response.json();
    const tokens: CognitoTokens = {
      idToken: data.id_token,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    };

    this.saveTokens(tokens);
    return tokens;
  }

  async refreshTokens(): Promise<CognitoTokens | null> {
    if (!this.tokens?.refreshToken) return null;

    const { cognito } = awsConfig;
    try {
      const response = await fetch(`${cognito.hostedUiUrl}/oauth2/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: cognito.clientId,
          refresh_token: this.tokens.refreshToken,
        }),
      });

      if (!response.ok) {
        this.clearTokens();
        return null;
      }

      const data = await response.json();
      const tokens: CognitoTokens = {
        idToken: data.id_token,
        accessToken: data.access_token,
        refreshToken: this.tokens.refreshToken,
        expiresIn: data.expires_in,
      };

      this.saveTokens(tokens);
      return tokens;
    } catch {
      this.clearTokens();
      return null;
    }
  }

  getAccessToken(): string | null {
    return this.tokens?.accessToken ?? null;
  }

  getIdToken(): string | null {
    return this.tokens?.idToken ?? null;
  }

  parseIdToken(): CognitoUser | null {
    const idToken = this.tokens?.idToken;
    if (!idToken) return null;

    try {
      const payload = idToken.split('.')[1];
      const decoded = JSON.parse(atob(payload));
      return {
        sub: decoded.sub,
        email: decoded.email,
        name: decoded.name || decoded['cognito:username'],
        picture: decoded.picture,
      };
    } catch {
      return null;
    }
  }

  isAuthenticated(): boolean {
    return !!this.tokens?.accessToken;
  }

  logout() {
    this.clearTokens();
  }
}

export const cognitoAuth = new CognitoAuthAdapter();
