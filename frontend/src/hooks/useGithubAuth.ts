/**
 * useGithubAuth
 *
 * Polls the backend for GitHub OAuth connection status and exposes helpers
 * to start / end the OAuth flow.
 *
 * On mount:
 *  - Reads the URL for `?github_auth=success` (set by the backend callback)
 *    and cleans it out of the URL bar
 *  - Calls /auth/github/status to know if the server has a token for us
 */
import { useCallback, useEffect, useState } from 'react';
import { apiService } from '@/services/api';

interface AuthStatus {
  configured: boolean;
  connected: boolean;
  user: string | null;
}

const initial: AuthStatus = { configured: false, connected: false, user: null };

export const useGithubAuth = () => {
  const [status, setStatus] = useState<AuthStatus>(initial);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await apiService.getGithubStatus();
      setStatus(s);
    } catch {
      setStatus(initial);
    } finally {
      setLoading(false);
    }
  }, []);

  // On mount, check for callback query params and refresh status
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authResult = params.get('github_auth');

    if (authResult === 'success') {
      const user = params.get('user') || null;
      setFlash({
        type: 'success',
        message: user ? `Connected as @${user}` : 'GitHub connected',
      });
      // Clean the URL so the flash doesn't reappear on refresh
      params.delete('github_auth');
      params.delete('user');
      const clean = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (clean ? `?${clean}` : ''));
    } else if (authResult === 'error') {
      const reason = params.get('reason') || 'unknown';
      setFlash({ type: 'error', message: `GitHub connection failed: ${reason}` });
      params.delete('github_auth');
      params.delete('reason');
      const clean = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (clean ? `?${clean}` : ''));
    }

    refresh();
  }, [refresh]);

  const connect = useCallback(() => {
    // Full-page redirect — the OAuth flow needs to leave the SPA
    window.location.href = apiService.getGithubLoginUrl();
  }, []);

  const disconnect = useCallback(async () => {
    try {
      await apiService.githubLogout();
      setStatus(prev => ({ ...prev, connected: false, user: null }));
      setFlash({ type: 'success', message: 'GitHub disconnected' });
    } catch (e) {
      setFlash({ type: 'error', message: 'Failed to disconnect' });
    }
  }, []);

  const dismissFlash = useCallback(() => setFlash(null), []);

  return {
    ...status,
    loading,
    flash,
    connect,
    disconnect,
    refresh,
    dismissFlash,
  };
};
