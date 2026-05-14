/**
 * @file App.tsx
 * @summary Vite web portal — Cognito PKCE sign-in and authenticated calls to the supply-chain HTTP API.
 * @context Reads `VITE_*` from `supply-chain/.generated/.env` (after Terraform provision).
 * @debugging If sign-in fails, confirm env vars and Cognito callback URLs match this origin.
 */

import { UserManager, User } from 'oidc-client-ts';
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type Dispatch, type SetStateAction } from 'react';

const authority = import.meta.env.VITE_COGNITO_AUTHORITY as string | undefined;
const clientId = import.meta.env.VITE_COGNITO_WEB_CLIENT_ID as string | undefined;
const redirectUri = import.meta.env.VITE_OIDC_REDIRECT_URI as string | undefined;
const apiBase = (import.meta.env.VITE_AWS_HTTP_API_BASE_URL as string | undefined)?.replace(/\/$/, '');

const CHIPS = ['Cognito PKCE', 'API Gateway', 'Lambda', 'DynamoDB', 'us-east-2'] as const;

function buildUserManager() {
  // Critical path: without these Vite envs (from `.generated/.env`) OIDC cannot start — see README provision steps.
  if (!authority || !clientId || !redirectUri) {
    throw new Error('Missing VITE_COGNITO_AUTHORITY, VITE_COGNITO_WEB_CLIENT_ID, or VITE_OIDC_REDIRECT_URI');
  }
  return new UserManager({
    authority,
    client_id: clientId,
    redirect_uri: redirectUri,
    post_logout_redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email supply-chain/order.read supply-chain/order.write',
    automaticSilentRenew: false,
    loadUserInfo: true
  });
}

function logLine(setter: Dispatch<SetStateAction<string[]>>, msg: string) {
  setter((prev) => [...prev.slice(-120), `${new Date().toISOString()} ${msg}`]);
}

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [dark, setDark] = useState(false);

  const mgr = useMemo(() => {
    try {
      return buildUserManager();
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (!mgr) return;
    mgr
      .signinRedirectCallback()
      .then((u) => {
        setUser(u);
        logLine(setLog, 'OIDC redirect handled — signed in');
      })
      .catch(() => {
        void mgr.getUser().then((u) => {
          if (u) {
            setUser(u);
            logLine(setLog, 'Restored user session');
          }
        });
      });
  }, [mgr]);

  const signIn = useCallback(() => {
    if (!mgr) return;
    void mgr.signinRedirect();
  }, [mgr]);

  const signOut = useCallback(() => {
    if (!mgr) return;
    void mgr.signoutRedirect();
  }, [mgr]);

  const callApi = useCallback(
    async (path: string, init?: RequestInit) => {
      if (!apiBase) {
        logLine(setLog, 'VITE_AWS_HTTP_API_BASE_URL is not set');
        return;
      }
      if (!user?.access_token) {
        logLine(setLog, 'No access_token — sign in first');
        return;
      }
      setBusy(true);
      const correlationId = crypto.randomUUID();
      try {
        const res = await fetch(`${apiBase}${path}`, {
          ...init,
          headers: {
            ...(init?.headers ?? {}),
            authorization: `Bearer ${user.access_token}`,
            'x-correlation-id': correlationId,
            ...(init?.body ? { 'content-type': 'application/json' } : {})
          }
        });
        const text = await res.text();
        logLine(setLog, `${init?.method ?? 'GET'} ${path} → ${res.status} cid=${correlationId} body=${text}`);
      } catch (e) {
        logLine(setLog, `ERROR ${path}: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setBusy(false);
      }
    },
    [user]
  );

  const t = useMemo(() => {
    const bg = dark ? '#0b1220' : '#f8fafc';
    const surface = dark ? '#111827' : '#ffffff';
    const surface2 = dark ? '#0f172a' : '#f1f5f9';
    const text = dark ? '#e2e8f0' : '#0f172a';
    const muted = dark ? '#94a3b8' : '#64748b';
    const border = dark ? 'rgba(148,163,184,0.22)' : 'rgba(15,23,42,0.08)';
    const primary = '#2563eb';
    const primaryHi = dark ? '#60a5fa' : '#1d4ed8';
    return { bg, surface, surface2, text, muted, border, primary, primaryHi };
  }, [dark]);

  const btn: CSSProperties = {
    padding: '10px 14px',
    borderRadius: 10,
    border: `1px solid ${t.border}`,
    background: t.surface2,
    color: t.text,
    fontWeight: 600,
    fontSize: 13,
    cursor: busy ? 'wait' : 'pointer',
    opacity: busy ? 0.65 : 1
  };

  const btnPrimary: CSSProperties = {
    ...btn,
    background: `linear-gradient(135deg, ${t.primary} 0%, ${t.primaryHi} 100%)`,
    color: '#fff',
    border: 'none'
  };

  if (!mgr) {
    return (
      <div style={{ minHeight: '100vh', background: t.bg, color: t.text, fontFamily: 'system-ui, sans-serif', padding: 32 }}>
        <div style={{ maxWidth: 560, margin: '0 auto', padding: 28, borderRadius: 16, border: `1px solid ${t.border}`, background: t.surface }}>
          <h1 style={{ marginTop: 0 }}>Configuration required</h1>
          <p style={{ color: t.muted, lineHeight: 1.6 }}>
            Copy <code>env.example</code> to <code>.env.local</code> with your Cognito + API Gateway values from Terraform outputs, then restart{' '}
            <code>npm run dev</code>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: t.bg, color: t.text, fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 20px 40px' }}>
        <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <img
              src="/ns-supply-3d-logo.png"
              alt=""
              width={72}
              height={72}
              style={{ borderRadius: 16, objectFit: 'cover', boxShadow: dark ? '0 12px 40px rgba(0,0,0,0.45)' : '0 12px 32px rgba(37,99,235,0.2)' }}
            />
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', color: t.muted, textTransform: 'uppercase' }}>NitroStack supply chain</div>
              <h1 style={{ margin: '6px 0 0', fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>
                Browser <span style={{ color: t.primaryHi }}>portal</span>
              </h1>
              <p style={{ margin: '10px 0 0', color: t.muted, maxWidth: 520, lineHeight: 1.55 }}>
                Same HTTP API as NitroStudio — sign in with Cognito (PKCE), then call catalog and orders with your user access token.
              </p>
            </div>
          </div>
          <button type="button" onClick={() => setDark((d) => !d)} style={{ ...btn, height: 36 }}>
            {dark ? 'Light' : 'Dark'} mode
          </button>
        </header>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          {CHIPS.map((c) => (
            <span
              key={c}
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: '6px 10px',
                borderRadius: 999,
                border: `1px solid ${t.border}`,
                background: t.surface,
                color: t.muted
              }}
            >
              {c}
            </span>
          ))}
        </div>

        <div
          style={{
            padding: 22,
            borderRadius: 16,
            border: `1px solid ${t.border}`,
            background: t.surface,
            boxShadow: dark ? '0 18px 50px rgba(0,0,0,0.35)' : '0 18px 50px rgba(15,23,42,0.06)'
          }}
        >
          {!user ? (
            <div style={{ display: 'grid', gap: 14 }}>
              <p style={{ margin: 0, color: t.muted }}>Use the hosted UI flow to obtain tokens for API Gateway.</p>
              <button type="button" onClick={signIn} style={{ ...btnPrimary, justifySelf: 'start' }}>
                Sign in with Cognito
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 16 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
                <span style={{ color: t.muted }}>
                  Signed in as <strong style={{ color: t.text }}>{user.profile.email ?? user.profile.sub}</strong>
                </span>
                <button type="button" onClick={signOut} style={btn}>
                  Sign out
                </button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                <button type="button" disabled={busy} style={btnPrimary} onClick={() => callApi('/v1/catalog/products')}>
                  Load catalog
                </button>
                <button type="button" disabled={busy} style={btnPrimary} onClick={() => callApi('/v1/orders')}>
                  List orders
                </button>
                <button
                  type="button"
                  disabled={busy}
                  style={btnPrimary}
                  onClick={() =>
                    callApi('/v1/orders', {
                      method: 'POST',
                      body: JSON.stringify({
                        customerRef: 'web-portal-user',
                        lines: [{ sku: 'SKU-001', quantity: 1 }]
                      })
                    })
                  }
                >
                  Place sample order
                </button>
              </div>
            </div>
          )}
        </div>

        <h2 style={{ marginTop: 24, fontSize: 13, fontWeight: 800, letterSpacing: '0.06em', color: t.muted, textTransform: 'uppercase' }}>Activity</h2>
        <pre
          style={{
            marginTop: 8,
            background: t.surface2,
            color: t.text,
            padding: 16,
            borderRadius: 14,
            maxHeight: 360,
            overflow: 'auto',
            fontSize: 12,
            border: `1px solid ${t.border}`
          }}
        >
          {log.join('\n') || 'No activity yet.'}
        </pre>
      </div>
    </div>
  );
}
