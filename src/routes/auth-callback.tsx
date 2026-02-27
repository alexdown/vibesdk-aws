/**
 * AWS Cognito Auth Callback Handler
 * Handles the OAuth callback from Cognito hosted UI
 */

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { cognitoAuth } from '@/lib/cognito-auth';

export default function AuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get('code');
    const errorParam = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    if (errorParam) {
      setError(errorDescription || errorParam);
      return;
    }

    if (!code) {
      setError('No authorization code received');
      return;
    }

    const redirectUri = `${window.location.origin}/auth/callback`;

    cognitoAuth
      .exchangeCodeForTokens(code, redirectUri)
      .then(() => {
        // Get intended URL or default to home
        const intendedUrl = sessionStorage.getItem('auth_intended_url') || '/';
        sessionStorage.removeItem('auth_intended_url');
        navigate(intendedUrl, { replace: true });
      })
      .catch((err) => {
        setError(err.message || 'Authentication failed');
      });
  }, [searchParams, navigate]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">Authentication Error</h1>
          <p className="mt-2 text-gray-600">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="mt-4 rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent mx-auto"></div>
        <p className="mt-4 text-gray-600">Completing sign in...</p>
      </div>
    </div>
  );
}
