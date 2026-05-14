'use client';

/**
 * Supply chain Studio widget — Automotive-inspired layout (hero, chips, appearance, tabs),
 * NitroStack `callTool` path + optional direct API Gateway calls. Logo: `public/ns-supply-3d-logo.png`.
 */

import Image from 'next/image';
import { useCallback, useEffect, useId, useMemo, useState, type CSSProperties } from 'react';
import { useWidgetSDK } from '@nitrostack/widgets';

const TOOL = 'supply_chain';
const WIDGET_APPEARANCE_KEY = 'ns-supply-widget-appearance';
type WidgetAppearance = 'light' | 'dark' | 'system';

const CAPABILITY_CHIPS = [
  'NitroStack MCP',
  'API Gateway',
  'Cognito',
  'Lambda',
  'DynamoDB',
  'NitroStudio'
] as const;

function readStoredAppearance(): WidgetAppearance {
  if (typeof window === 'undefined') return 'light';
  const v = localStorage.getItem(WIDGET_APPEARANCE_KEY);
  if (v === 'dark' || v === 'light' || v === 'system') return v;
  return 'light';
}

/** Inline mark if the PNG logo is unavailable (distinct from Automotive vehicle mark). */
function SupplyChainVectorMark({ gid, primary, accent }: { gid: string; primary: string; accent: string }) {
  const gradId = `ns-sc-cube-${gid}`;
  return (
    <svg width="56" height="56" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <defs>
        <linearGradient id={gradId} x1="12" y1="44" x2="44" y2="20" gradientUnits="userSpaceOnUse">
          <stop stopColor={primary} stopOpacity="0.95" />
          <stop offset="1" stopColor={accent} stopOpacity="0.85" />
        </linearGradient>
      </defs>
      <path d="M32 8L52 20v24L32 56 12 44V20L32 8z" fill={`url(#${gradId})`} opacity="0.92" />
      <path d="M32 8v24M32 32l20 12M32 32L12 44" stroke="white" strokeOpacity="0.35" strokeWidth="1.2" />
      <circle cx="48" cy="14" r="3" fill={accent}>
        <animate attributeName="opacity" values="0.5;1;0.5" dur="2.4s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

export default function SupplyChainStudioPage() {
  const sdk = useWidgetSDK();
  const markGid = useId().replace(/:/g, '');
  const apiBase = (process.env.NEXT_PUBLIC_AWS_HTTP_API_BASE_URL ?? '').replace(/\/$/, '');
  const [appearance, setAppearance] = useState<WidgetAppearance>('light');
  const [mainTab, setMainTab] = useState<'mcp' | 'direct'>('mcp');
  const [bearer, setBearer] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [customerRef, setCustomerRef] = useState('demo-customer');
  const [linesJson, setLinesJson] = useState('[{"sku":"SKU-001","quantity":1}]');
  const [logoOk, setLogoOk] = useState(true);

  useEffect(() => {
    setAppearance(readStoredAppearance());
  }, []);

  const darkMode = useMemo(() => {
    if (appearance === 'dark') return true;
    if (appearance === 'light') return false;
    if (typeof window !== 'undefined' && window.matchMedia) return window.matchMedia('(prefers-color-scheme: dark)').matches;
    return false;
  }, [appearance]);

  const theme = useMemo(() => {
    const primary = '#2563eb';
    const primaryHi = darkMode ? '#60a5fa' : '#1d4ed8';
    const accent = darkMode ? '#f97316' : '#ea580c';
    const bg = darkMode ? '#0b1220' : '#f8fafc';
    const surface = darkMode ? '#111827' : '#ffffff';
    const surface2 = darkMode ? '#0f172a' : '#f1f5f9';
    const text = darkMode ? '#e2e8f0' : '#0f172a';
    const muted = darkMode ? '#94a3b8' : '#64748b';
    const border = darkMode ? 'rgba(148,163,184,0.22)' : 'rgba(15,23,42,0.08)';
    return { primary, primaryHi, accent, bg, surface, surface2, text, muted, border };
  }, [darkMode]);

  const setAppearancePersist = useCallback((next: WidgetAppearance) => {
    setAppearance(next);
    try {
      localStorage.setItem(WIDGET_APPEARANCE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const push = useCallback((line: string) => {
    setLog((prev) => [...prev.slice(-100), `${new Date().toISOString()} ${line}`]);
  }, []);

  const callMcp = useCallback(
    async (payload: Record<string, unknown>) => {
      setBusy(true);
      try {
        const res = await sdk.callTool(TOOL, payload);
        push(`MCP → ${JSON.stringify(res)}`);
      } catch (e) {
        push(`MCP ERROR → ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setBusy(false);
      }
    },
    [push, sdk]
  );

  const callDirect = useCallback(
    async (path: string, init?: RequestInit) => {
      if (!apiBase) {
        push('Direct API: set NEXT_PUBLIC_AWS_HTTP_API_BASE_URL at widget build time');
        return;
      }
      if (!bearer.trim()) {
        push('Direct API: paste a Bearer access token (from the web portal after sign-in)');
        return;
      }
      setBusy(true);
      const correlationId = crypto.randomUUID();
      try {
        const res = await fetch(`${apiBase}${path}`, {
          ...init,
          headers: {
            ...(init?.headers ?? {}),
            authorization: `Bearer ${bearer.trim()}`,
            'x-correlation-id': correlationId,
            ...(init?.body ? { 'content-type': 'application/json' } : {})
          }
        });
        const text = await res.text();
        push(`Direct ${res.status} ${path} cid=${correlationId} → ${text}`);
      } catch (e) {
        push(`Direct ERROR ${path} → ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setBusy(false);
      }
    },
    [apiBase, bearer, push]
  );

  const parsedLines = useMemo(() => {
    try {
      const v = JSON.parse(linesJson) as unknown;
      if (!Array.isArray(v)) return { ok: false as const, error: 'lines must be a JSON array' };
      return { ok: true as const, value: v as Array<{ sku: string; quantity: number }> };
    } catch {
      return { ok: false as const, error: 'invalid JSON for lines' };
    }
  }, [linesJson]);

  const btn: CSSProperties = {
    padding: '10px 14px',
    borderRadius: 10,
    border: `1px solid ${theme.border}`,
    background: theme.surface2,
    color: theme.text,
    fontWeight: 600,
    fontSize: 13,
    cursor: busy ? 'wait' : 'pointer',
    opacity: busy ? 0.65 : 1
  };

  const btnPrimary: CSSProperties = {
    ...btn,
    background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.primaryHi} 100%)`,
    color: '#fff',
    border: 'none'
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: theme.bg,
        color: theme.text,
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
      }}
    >
      <div style={{ maxWidth: 1040, margin: '0 auto', padding: '20px 18px 32px' }}>
        <header
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 18
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 72,
                height: 72,
                flexShrink: 0,
                borderRadius: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: darkMode ? '0 12px 40px rgba(0,0,0,0.45)' : '0 12px 32px rgba(37,99,235,0.18)',
                overflow: 'hidden',
                background: theme.surface2
              }}
            >
              {logoOk ? (
                <Image
                  src="/ns-supply-3d-logo.png"
                  alt="NitroStack supply chain"
                  width={72}
                  height={72}
                  style={{ objectFit: 'cover' }}
                  unoptimized
                  onError={() => setLogoOk(false)}
                />
              ) : (
                <SupplyChainVectorMark gid={markGid} primary={theme.primaryHi} accent={theme.accent} />
              )}
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', color: theme.muted, textTransform: 'uppercase' }}>
                NitroStack + AWS
              </div>
              <h1 style={{ margin: '4px 0 0', fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.15 }}>
                Supply chain <span style={{ color: theme.primaryHi }}>control plane</span>
              </h1>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: theme.muted }}>Appearance</span>
            {(['light', 'dark', 'system'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setAppearancePersist(m)}
                style={{
                  ...btn,
                  padding: '6px 10px',
                  fontSize: 12,
                  background: appearance === m ? theme.primary : theme.surface2,
                  color: appearance === m ? '#fff' : theme.text,
                  border: appearance === m ? 'none' : `1px solid ${theme.border}`
                }}
              >
                {m}
              </button>
            ))}
          </div>
        </header>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          {CAPABILITY_CHIPS.map((c) => (
            <span
              key={c}
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: '6px 10px',
                borderRadius: 999,
                border: `1px solid ${theme.border}`,
                background: theme.surface,
                color: theme.muted
              }}
            >
              {c}
            </span>
          ))}
        </div>

        <p style={{ margin: '0 0 18px', color: theme.muted, lineHeight: 1.6, maxWidth: 820 }}>
          Demo paths for NitroStudio: <strong style={{ color: theme.text }}>Studio → MCP</strong> uses <code>supply_chain</code> tools (server-side Cognito client credentials + Secrets Manager).
          <strong style={{ color: theme.text }}> Direct API</strong> exercises the same HTTP API from the widget with a bearer token.
        </p>

        <div
          style={{
            display: 'inline-flex',
            padding: 4,
            borderRadius: 12,
            background: theme.surface2,
            border: `1px solid ${theme.border}`,
            marginBottom: 18
          }}
        >
          {(['mcp', 'direct'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setMainTab(t)}
              style={{
                border: 'none',
                borderRadius: 10,
                padding: '10px 16px',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
                background: mainTab === t ? theme.surface : 'transparent',
                color: mainTab === t ? theme.text : theme.muted,
                boxShadow: mainTab === t ? (darkMode ? '0 4px 20px rgba(0,0,0,0.35)' : '0 4px 16px rgba(15,23,42,0.08)') : 'none'
              }}
            >
              {t === 'mcp' ? 'Path A — MCP (Studio)' : 'Path B — Direct API'}
            </button>
          ))}
        </div>

        <div
          style={{
            display: 'grid',
            gap: 16,
            padding: 20,
            borderRadius: 16,
            border: `1px solid ${theme.border}`,
            background: theme.surface,
            boxShadow: darkMode ? '0 18px 50px rgba(0,0,0,0.35)' : '0 18px 50px rgba(15,23,42,0.06)'
          }}
        >
          {mainTab === 'mcp' ? (
            <>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>MCP tool actions</h2>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                <button type="button" disabled={busy} style={btnPrimary} onClick={() => callMcp({ action: 'catalog_list' })}>
                  catalog_list
                </button>
                <button type="button" disabled={busy} style={btnPrimary} onClick={() => callMcp({ action: 'catalog_get', productId: 'SKU-001' })}>
                  catalog_get SKU-001
                </button>
                <button type="button" disabled={busy} style={btnPrimary} onClick={() => callMcp({ action: 'order_list' })}>
                  order_list
                </button>
              </div>
              <div style={{ display: 'grid', gap: 12, marginTop: 4 }}>
                <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 600, color: theme.muted }}>
                  customerRef
                  <input value={customerRef} onChange={(e) => setCustomerRef(e.target.value)} style={{ padding: 12, borderRadius: 10, border: `1px solid ${theme.border}`, background: theme.surface2, color: theme.text }} />
                </label>
                <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 600, color: theme.muted }}>
                  lines JSON
                  <textarea
                    value={linesJson}
                    onChange={(e) => setLinesJson(e.target.value)}
                    rows={4}
                    style={{
                      padding: 12,
                      borderRadius: 10,
                      border: `1px solid ${theme.border}`,
                      background: theme.surface2,
                      color: theme.text,
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                      fontSize: 12
                    }}
                  />
                </label>
                <button
                  type="button"
                  disabled={busy || !parsedLines.ok}
                  style={{ ...btnPrimary, justifySelf: 'start' }}
                  onClick={() => {
                    if (!parsedLines.ok) return;
                    callMcp({ action: 'order_create', customerRef, lines: parsedLines.value });
                  }}
                >
                  order_create
                </button>
                {!parsedLines.ok ? <span style={{ color: '#f87171', fontSize: 13 }}>{parsedLines.error}</span> : null}
              </div>
            </>
          ) : (
            <>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Direct API Gateway</h2>
              <p style={{ margin: 0, color: theme.muted, fontSize: 13, lineHeight: 1.55 }}>
                Build with <code>NEXT_PUBLIC_AWS_HTTP_API_BASE_URL</code>. Paste an access token from the web portal (Network tab) after Cognito sign-in.
              </p>
              <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 600, color: theme.muted }}>
                Bearer access token
                <input
                  value={bearer}
                  onChange={(e) => setBearer(e.target.value)}
                  placeholder="eyJra…"
                  style={{ padding: 12, borderRadius: 10, border: `1px solid ${theme.border}`, background: theme.surface2, color: theme.text }}
                />
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                <button type="button" disabled={busy} style={btnPrimary} onClick={() => callDirect('/v1/catalog/products')}>
                  GET /v1/catalog/products
                </button>
                <button type="button" disabled={busy} style={btnPrimary} onClick={() => callDirect('/v1/orders')}>
                  GET /v1/orders
                </button>
                <button
                  type="button"
                  disabled={busy || !parsedLines.ok}
                  style={btnPrimary}
                  onClick={() => {
                    if (!parsedLines.ok) return;
                    callDirect('/v1/orders', {
                      method: 'POST',
                      body: JSON.stringify({ customerRef, lines: parsedLines.value })
                    });
                  }}
                >
                  POST /v1/orders
                </button>
              </div>
              {!parsedLines.ok ? <span style={{ color: '#f87171', fontSize: 13 }}>{parsedLines.error}</span> : null}
            </>
          )}
        </div>

        <section style={{ marginTop: 22 }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 10px', color: theme.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Activity log</h2>
          <pre
            style={{
              margin: 0,
              background: theme.surface2,
              color: theme.text,
              padding: 16,
              borderRadius: 14,
              maxHeight: 380,
              overflow: 'auto',
              fontSize: 12,
              lineHeight: 1.45,
              border: `1px solid ${theme.border}`
            }}
          >
            {log.length ? log.join('\n') : 'No events yet — run an action from NitroStudio.'}
          </pre>
        </section>
      </div>
    </div>
  );
}
