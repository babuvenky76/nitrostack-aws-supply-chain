'use client';

/**
 * @file supply-chain-studio/page.tsx
 * @description NitroStack widget UI for the `supply_chain` MCP tool.
 *              Features a premium two-tab dashboard (CRUD Operations & Help Manual).
 *              Modeled after the high-fidelity aesthetics of the automotive project.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState, Component, type ReactNode, type ErrorInfo, type CSSProperties } from 'react';
import { useWidgetSDK, getWidgetSDK } from '@nitrostack/widgets';

const TOOL = 'supply_chain';
const WIDGET_APPEARANCE_KEY = 'ns-supply-widget-appearance';
type WidgetAppearance = 'light' | 'dark' | 'system';

function readStoredAppearance(): WidgetAppearance {
  if (typeof window === 'undefined') return 'light';
  const v = localStorage.getItem(WIDGET_APPEARANCE_KEY);
  if (v === 'dark' || v === 'light' || v === 'system') return v;
  return 'light';
}

const HERO_CAPABILITY_CHIPS = [
  'NitroStack MCP',
  'AWS API Gateway',
  'AWS Cognito',
  'AWS Lambda',
  'Amazon DynamoDB',
  'NitroStudio'
] as const;

const HERO_HEADLINE = 'Supply chain control plane';
const HERO_HEADLINE_ACCENT = 'integrated';
const HERO_TAGLINE =
  'Real-time catalog exploration, automated inventory tracking, and secure order placement powered by a robust, secure AWS serverless backend with machine-to-machine authentication.';

type MainTab = 'search_browse' | 'create_order' | 'help';
type HelpSubTab = 'business' | 'architecture' | 'nitrostack' | 'security' | 'guide';

interface Product {
  productId: string;
  sku: string;
  name: string;
  unitPriceCents: number;
}

interface OrderLine {
  sku: string;
  quantity: number;
  unitPriceCents: number;
}

interface OrderRecord {
  orderId: string;
  customerRef: string;
  status: 'CONFIRMED' | 'CANCELLED';
  lines: OrderLine[];
  createdAt: string;
  updatedAt: string;
}

function ShowcaseLogoMark({ primary, accent, darkMode }: { primary: string; accent: string; darkMode: boolean }) {
  const gradId = 'ns-supply-cube-grad';
  const ground = darkMode ? 'rgba(0,0,0,0.45)' : 'rgba(37,99,235,0.12)';
  return (
    <svg width="60" height="60" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <defs>
        <linearGradient id={gradId} x1="12" y1="44" x2="44" y2="20" gradientUnits="userSpaceOnUse">
          <stop stopColor={primary} stopOpacity="0.95" />
          <stop offset="1" stopColor={accent} stopOpacity="0.85" />
        </linearGradient>
      </defs>
      <ellipse cx="32" cy="56" rx="20" ry="4" fill={ground} />
      <path d="M32 6L54 18v26L32 58 10 44V18L32 6z" fill={`url(#${gradId})`} opacity="0.95" />
      <path d="M32 6v26M32 32l22 12M32 32L10 44" stroke="white" strokeOpacity="0.4" strokeWidth="1.5" />
      <circle cx="50" cy="12" r="3.5" fill={accent}>
        <animate attributeName="opacity" values="0.4;1;0.4" dur="2s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

function formatCrudCell(v: unknown, maxLen = 4000): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') {
    const s = JSON.stringify(v, null, 2);
    return s.length > maxLen ? `${s.slice(0, maxLen)}\n…` : s;
  }
  const s = String(v);
  return s.length > maxLen ? `${s.slice(0, maxLen)}…` : s;
}

type CrudTableView =
  | { kind: 'kv'; rows: { field: string; value: string }[] }
  | { kind: 'grid'; columns: string[]; rows: string[][] }
  | null;

function crudTableView(data: unknown): CrudTableView {
  if (data === null || data === undefined) return null;
  
  // Unpack potential wrapping structure
  let inner = data as Record<string, unknown>;
  if (inner.structuredContent && typeof inner.structuredContent === 'object' && !Array.isArray(inner.structuredContent)) {
    inner = inner.structuredContent as Record<string, unknown>;
  }
  if (inner.data !== undefined) {
    return crudTableView(inner.data);
  }

  if (Array.isArray(data)) {
    if (data.length === 0) return { kind: 'kv', rows: [{ field: 'items', value: '(empty array)' }] };
    const first = data[0];
    if (first && typeof first === 'object' && !Array.isArray(first)) {
      const cols = Object.keys(first as object);
      if (cols.length === 0) return { kind: 'kv', rows: [{ field: 'items', value: formatCrudCell(data) }] };
      const maxRows = Math.min(data.length, 25);
      const rows: string[][] = [];
      for (let i = 0; i < maxRows; i++) {
        const item = data[i];
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          rows.push(cols.map((c) => formatCrudCell((item as Record<string, unknown>)[c], 1200)));
        }
      }
      return { kind: 'grid', columns: cols, rows };
    }
    return { kind: 'kv', rows: [{ field: 'items', value: formatCrudCell(data) }] };
  }

  if (typeof data !== 'object') {
    return { kind: 'kv', rows: [{ field: 'value', value: String(data) }] };
  }

  const o = data as Record<string, unknown>;
  const pairs: { field: string; value: string }[] = [];
  
  if (o.ok !== undefined) pairs.push({ field: 'status', value: o.ok ? 'SUCCESS' : 'FAILED' });
  if (o.correlationId !== undefined) pairs.push({ field: 'correlationId', value: String(o.correlationId) });
  if (o.error !== undefined) pairs.push({ field: 'error', value: String(o.error) });

  let target = o;
  if (o.structuredContent && typeof o.structuredContent === 'object' && !Array.isArray(o.structuredContent)) {
    target = o.structuredContent as Record<string, unknown>;
  }
  if (target.data && typeof target.data === 'object' && !Array.isArray(target.data)) {
    target = target.data as Record<string, unknown>;
  }

  for (const [k, v] of Object.entries(target)) {
    if (k === 'ok' || k === 'correlationId' || k === 'error' || k === 'structuredContent' || k === 'data') continue;
    pairs.push({ field: k, value: formatCrudCell(v) });
  }

  return pairs.length ? { kind: 'kv', rows: pairs } : null;
}

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null; errorInfo: ErrorInfo | null }> {
  public state = {
    hasError: false,
    error: null as Error | null,
    errorInfo: null as ErrorInfo | null
  };

  public static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: 24,
          background: '#0f172a',
          color: '#f8fafc',
          border: '2px solid #ef4444',
          borderRadius: 12,
          margin: 16,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
        }}>
          <h2 style={{ color: '#ef4444', marginTop: 0, fontSize: 18, borderBottom: '1px solid rgba(239, 68, 68, 0.3)', paddingBottom: 8 }}>
            ⚠️ Supply Chain Studio Widget Runtime Error
          </h2>
          <p style={{ fontWeight: 'bold', margin: '12px 0 6px', color: '#fca5a5' }}>
            {this.state.error?.toString()}
          </p>
          <pre style={{
            background: '#020617',
            padding: 12,
            borderRadius: 8,
            overflow: 'auto',
            maxHeight: 300,
            fontSize: 12,
            border: '1px solid #1e293b',
            color: '#cbd5e1'
          }}>
            {this.state.error?.stack}
          </pre>
          {this.state.errorInfo && (
            <div style={{ marginTop: 16, fontSize: 12, color: '#94a3b8' }}>
              Component Stack Trace:
              <pre style={{
                background: '#020617',
                padding: 12,
                borderRadius: 8,
                overflow: 'auto',
                maxHeight: 200,
                fontSize: 11,
                border: '1px solid #1e293b',
                marginTop: 6,
                color: '#94a3b8'
              }}>
                {this.state.errorInfo.componentStack}
              </pre>
            </div>
          )}
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: 16,
              background: '#ef4444',
              color: 'white',
              border: 'none',
              padding: '8px 16px',
              borderRadius: 6,
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

function SupplyChainStudioPageContent() {
  const sdk = useWidgetSDK();

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Cognito Direct Auth & Premium Portal states
  const [token, setToken] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<'sign_in' | 'sign_up' | 'confirm_code'>('sign_in');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [cognitoConfig, setCognitoConfig] = useState<{
    userPoolId: string;
    clientId: string;
    region: string;
    apiUrl: string;
  } | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);

  // Initialize token from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('ns-supply-token');
      if (stored) {
        setToken(stored);
      }
    }
  }, []);

  const updateToken = useCallback((newToken: string | null) => {
    setToken(newToken);
    if (typeof window !== 'undefined') {
      if (newToken) {
        localStorage.setItem('ns-supply-token', newToken);
      } else {
        localStorage.removeItem('ns-supply-token');
      }
    }
  }, []);

  // Secure tool wrapper that automatically injects userToken
  const callSecureTool = useCallback(async (actionName: string, payload: Record<string, any> = {}) => {
    const tokenToUse = actionName === 'get_public_config' ? undefined : (token || undefined);
    return await getWidgetSDK().callTool(TOOL, {
      action: actionName,
      userToken: tokenToUse,
      ...payload
    });
  }, [token]);

  const [appearance, setAppearance] = useState<WidgetAppearance>('light');
  const [systemDark, setSystemDark] = useState(false);
  const [mainTab, setMainTab] = useState<MainTab>('search_browse');
  const [helpSubTab, setHelpSubTab] = useState<HelpSubTab>('business');

  // Cache of products fetched from catalog
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [loadingProducts, setLoadingProducts] = useState(false);

  // Cache of orders fetched
  const [allOrders, setAllOrders] = useState<OrderRecord[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<OrderRecord | null>(null);
  const [productId, setProductId] = useState('SKU-001');
  const [orderId, setOrderId] = useState('');
  const [orderSearch, setOrderSearch] = useState('');
  const [showOrderDropdown, setShowOrderDropdown] = useState(false);
  const [loadingOrders, setLoadingOrders] = useState(false);

  // Cart / Visual creation state
  const [customerRef, setCustomerRef] = useState('demo-customer');
  const [visualCart, setVisualCart] = useState<Array<{ sku: string; quantity: number; name: string; unitPriceCents: number }>>([]);
  const [cartSku, setCartSku] = useState('SKU-001');
  const [cartQty, setCartQty] = useState(1);
  const [hoveredTooltipField, setHoveredTooltipField] = useState<string | null>(null);

  // Output states
  const [crudOut, setCrudOut] = useState<unknown>(null);
  const [currentAction, setCurrentAction] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [errorState, setErrorState] = useState<{ message: string; correlationId?: string } | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);

  // Load public Cognito configurations
  useEffect(() => {
    let active = true;
    const fetchConfig = async () => {
      try {
        const widgetSdk = getWidgetSDK();
        if (typeof window !== 'undefined' && !widgetSdk.isReady()) {
          await widgetSdk.waitForReady(1500);
        }
        if (!active) return;

        let configResolved = false;

        try {
          const r = await widgetSdk.callTool(TOOL, { action: 'get_public_config' });
          if (r && typeof r === 'object') {
            const data = (r as any).data || (r as any).structuredContent?.data || r;
            if (data && data.userPoolId && data.clientId) {
              setCognitoConfig(data);
              configResolved = true;
            }
          }
        } catch (toolErr) {
          console.warn('MCP callTool failed, attempting client environment fallback:', toolErr);
        }

        if (!configResolved && active) {
          // Fall back to Next.js environment variables if the MCP tool is unavailable or failed
          const authority = process.env.VITE_COGNITO_AUTHORITY || process.env.NEXT_PUBLIC_COGNITO_AUTHORITY || '';
          const match = authority.match(/cognito-idp\.([^.]+)\.amazonaws\.com\/(.+)$/);
          const region = match ? match[1] : '';
          const userPoolId = match ? match[2] : '';
          const clientId = process.env.VITE_COGNITO_WEB_CLIENT_ID || process.env.NEXT_PUBLIC_COGNITO_WEB_CLIENT_ID || '';
          const apiUrl = process.env.VITE_AWS_HTTP_API_BASE_URL || process.env.NEXT_PUBLIC_AWS_HTTP_API_BASE_URL || '';

          if (clientId && userPoolId && apiUrl && region) {
            setCognitoConfig({
              userPoolId,
              clientId,
              region,
              apiUrl
            });
          }
        }
      } catch (err) {
        console.error('Failed to load public config:', err);
      } finally {
        if (active) setLoadingConfig(false);
      }
    };
    fetchConfig();
    return () => {
      active = false;
    };
  }, []);

  // Lazy loaders for background auto-fetch triggers (secured)
  const lazyLoadProducts = useCallback(async () => {
    if (!token || allProducts.length > 0 || loadingProducts) return;
    setLoadingProducts(true);
    setErrorState(null);
    try {
      const widgetSdk = getWidgetSDK();
      if (typeof window !== 'undefined' && !widgetSdk.isReady()) {
        await widgetSdk.waitForReady(1500);
      }
      const r = await callSecureTool('catalog_list');
      if (r && typeof r === 'object') {
        const error = (r as any).error;
        if (error) {
          setErrorState({ message: error, correlationId: (r as any).correlationId });
        } else {
          const data = (r as any).data || (r as any).structuredContent?.data || r;
          const products = Array.isArray(data) ? data : (data && Array.isArray((data as any).products) ? (data as any).products : []);
          setAllProducts(products);
        }
      }
    } catch (err) {
      console.error('Lazy catalog fetch failed:', err);
      setErrorState({ message: err instanceof Error ? err.message : String(err) });
    } finally {
      setLoadingProducts(false);
    }
  }, [allProducts.length, loadingProducts, token, callSecureTool]);

  const lazyLoadOrders = useCallback(async () => {
    if (!token || allOrders.length > 0 || loadingOrders) return;
    setLoadingOrders(true);
    setErrorState(null);
    try {
      const widgetSdk = getWidgetSDK();
      if (typeof window !== 'undefined' && !widgetSdk.isReady()) {
        await widgetSdk.waitForReady(1500);
      }
      const r = await callSecureTool('order_list');
      if (r && typeof r === 'object') {
        const error = (r as any).error;
        if (error) {
          setErrorState({ message: error, correlationId: (r as any).correlationId });
        } else {
          const data = (r as any).data || (r as any).structuredContent?.data || r;
          const orders = Array.isArray(data) ? data : (data && Array.isArray((data as any).orders) ? (data as any).orders : []);
          setAllOrders(orders);
        }
      }
    } catch (err) {
      console.error('Lazy orders fetch failed:', err);
      setErrorState({ message: err instanceof Error ? err.message : String(err) });
    } finally {
      setLoadingOrders(false);
    }
  }, [allOrders.length, loadingOrders, token, callSecureTool]);

  // Load products and orders cache when token is acquired eagerly once SDK is ready
  useEffect(() => {
    if (!token) return;
    let active = true;
    const fetchCatalogAndOrders = async () => {
      try {
        const widgetSdk = getWidgetSDK();
        if (typeof window !== 'undefined' && !widgetSdk.isReady()) {
          await widgetSdk.waitForReady(1500);
        }
        if (!active) return;
        
        // Eager load catalog products
        setLoadingProducts(true);
        setErrorState(null);
        try {
          const rProd = await callSecureTool('catalog_list');
          if (active && rProd && typeof rProd === 'object') {
            const error = (rProd as any).error;
            if (error) {
              setErrorState({ message: error, correlationId: (rProd as any).correlationId });
            } else {
              const data = (rProd as any).data || (rProd as any).structuredContent?.data || rProd;
              const products = Array.isArray(data) ? data : (data && Array.isArray((data as any).products) ? (data as any).products : []);
              setAllProducts(products);
            }
          }
        } catch (err) {
          console.error('Eager catalog fetch failed:', err);
          if (active) setErrorState({ message: err instanceof Error ? err.message : String(err) });
        } finally {
          if (active) setLoadingProducts(false);
        }

        // Eager load order transactions
        setLoadingOrders(true);
        try {
          const rOrd = await callSecureTool('order_list');
          if (active && rOrd && typeof rOrd === 'object') {
            const error = (rOrd as any).error;
            if (error) {
              setErrorState({ message: error, correlationId: (rOrd as any).correlationId });
            } else {
              const data = (rOrd as any).data || (rOrd as any).structuredContent?.data || rOrd;
              const orders = Array.isArray(data) ? data : (data && Array.isArray((data as any).orders) ? (data as any).orders : []);
              setAllOrders(orders);
            }
          }
        } catch (err) {
          console.error('Eager orders fetch failed:', err);
          if (active) setErrorState({ message: err instanceof Error ? err.message : String(err) });
        } finally {
          if (active) setLoadingOrders(false);
        }
      } catch (err) {
        console.error('Eager token-based initialization failed:', err);
      }
    };
    fetchCatalogAndOrders();
    return () => {
      active = false;
    };
  }, [token, callSecureTool]);

  // Sync cartSku default to first loaded product if possible
  useEffect(() => {
    if (allProducts.length > 0 && !allProducts.some(p => p.sku === cartSku)) {
      setCartSku(allProducts[0].sku);
    }
  }, [allProducts, cartSku]);

  // Lexical search filter
  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q || q === '*' || q.includes('*')) return allProducts;
    return allProducts.filter(
      (p) => p.sku.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)
    );
  }, [allProducts, productSearch]);

  // Lexical search filter for orders
  const filteredOrders = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();
    if (!q || q === '*' || q.includes('*')) return allOrders;
    return allOrders.filter((ord) => {
      return (
        ord.orderId.toLowerCase().includes(q) ||
        ord.customerRef.toLowerCase().includes(q) ||
        ord.status.toLowerCase() === q
      );
    });
  }, [allOrders, orderSearch]);

  const handleSelectProduct = useCallback(
    async (prod: Product) => {
      setSelectedProduct(prod);
      setShowProductDropdown(false);
      setProductSearch(prod.name);
      
      setBusy(true);
      setCurrentAction('catalog_get');
      setCrudOut(null);
      try {
        const r = await callSecureTool('catalog_get', { productId: prod.productId });
        setCrudOut(r);
      } catch (e) {
        setCrudOut({ error: String(e) });
      } finally {
        setBusy(false);
      }
    },
    [callSecureTool]
  );

  const loadOrdersList = useCallback(async () => {
    setBusy(true);
    setCurrentAction('order_list');
    setCrudOut(null);
    setErrorState(null);
    try {
      const r = await callSecureTool('order_list');
      if (r && typeof r === 'object') {
        const error = (r as any).error;
        if (error) {
          setErrorState({ message: error, correlationId: (r as any).correlationId });
        } else {
          const data = (r as any).data || (r as any).structuredContent?.data || r;
          const orders = Array.isArray(data) ? data : (data && Array.isArray((data as any).orders) ? (data as any).orders : []);
          setAllOrders(orders);
        }
      }
      setCrudOut(r);
    } catch (e) {
      setCrudOut({ error: String(e) });
      setErrorState({ message: String(e) });
    } finally {
      setBusy(false);
    }
  }, [callSecureTool]);

  const handleSelectOrder = useCallback(
    async (ord: OrderRecord) => {
      setSelectedOrder(ord);
      setOrderId(ord.orderId);
      
      setBusy(true);
      setCurrentAction('order_get');
      setCrudOut(null);
      try {
        const r = await callSecureTool('order_get', { orderId: ord.orderId });
        setCrudOut(r);
      } catch (e) {
        setCrudOut({ error: String(e) });
      } finally {
        setBusy(false);
      }
    },
    [callSecureTool]
  );

  const runCrud = useCallback(
    async (actionName: string, payload: Record<string, unknown>) => {
      setBusy(true);
      setCurrentAction(actionName);
      setCrudOut(null);
      try {
        const r = await callSecureTool(actionName, payload);
        setCrudOut(r);
        return r;
      } catch (e) {
        setCrudOut({ error: String(e) });
        return null;
      } finally {
        setBusy(false);
      }
    },
    [callSecureTool]
  );

  // Cognito Direct Authentication flow handlers
  const handleCognitoSignIn = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cognitoConfig) return;
    setAuthLoading(true);
    setAuthError(null);
    try {
      const response = await fetch(`https://cognito-idp.${cognitoConfig.region}.amazonaws.com/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-amz-json-1.1',
          'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth'
        },
        body: JSON.stringify({
          AuthFlow: 'USER_PASSWORD_AUTH',
          ClientId: cognitoConfig.clientId,
          AuthParameters: {
            USERNAME: authEmail,
            PASSWORD: authPassword
          }
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || data.__type || 'Authentication failed');
      }

      const idToken = data.AuthenticationResult?.IdToken;
      if (!idToken) {
        throw new Error('Authentication succeeded but did not return an ID Token.');
      }

      updateToken(idToken);
    } catch (err) {
      console.error('Sign-in error:', err);
      setAuthError(err instanceof Error ? err.message : String(err));
    } finally {
      setAuthLoading(false);
    }
  }, [cognitoConfig, authEmail, authPassword, updateToken]);

  const handleCognitoSignUp = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cognitoConfig) return;
    setAuthLoading(true);
    setAuthError(null);
    try {
      const response = await fetch(`https://cognito-idp.${cognitoConfig.region}.amazonaws.com/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-amz-json-1.1',
          'X-Amz-Target': 'AWSCognitoIdentityProviderService.SignUp'
        },
        body: JSON.stringify({
          ClientId: cognitoConfig.clientId,
          Username: authEmail,
          Password: authPassword,
          UserAttributes: [
            {
              Name: 'email',
              Value: authEmail
            }
          ]
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || data.__type || 'Sign up failed');
      }

      setAuthMode('confirm_code');
    } catch (err) {
      console.error('Sign-up error:', err);
      setAuthError(err instanceof Error ? err.message : String(err));
    } finally {
      setAuthLoading(false);
    }
  }, [cognitoConfig, authEmail, authPassword]);

  const handleCognitoConfirmSignUp = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cognitoConfig) return;
    setAuthLoading(true);
    setAuthError(null);
    try {
      const response = await fetch(`https://cognito-idp.${cognitoConfig.region}.amazonaws.com/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-amz-json-1.1',
          'X-Amz-Target': 'AWSCognitoIdentityProviderService.ConfirmSignUp'
        },
        body: JSON.stringify({
          ClientId: cognitoConfig.clientId,
          Username: authEmail,
          ConfirmationCode: verificationCode
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || data.__type || 'Confirmation failed');
      }

      // Automatically sign in the user after code confirmation!
      const signInResponse = await fetch(`https://cognito-idp.${cognitoConfig.region}.amazonaws.com/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-amz-json-1.1',
          'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth'
        },
        body: JSON.stringify({
          AuthFlow: 'USER_PASSWORD_AUTH',
          ClientId: cognitoConfig.clientId,
          AuthParameters: {
            USERNAME: authEmail,
            PASSWORD: authPassword
          }
        })
      });

      const signInData = await signInResponse.json();
      if (!signInResponse.ok) {
        setAuthMode('sign_in');
        throw new Error('Account verified successfully! Please sign in with your credentials.');
      }

      const idToken = signInData.AuthenticationResult?.IdToken;
      if (!idToken) {
        setAuthMode('sign_in');
        throw new Error('Verification complete! Please sign in with your credentials.');
      }

      updateToken(idToken);
    } catch (err) {
      console.error('Verification error:', err);
      setAuthError(err instanceof Error ? err.message : String(err));
    } finally {
      setAuthLoading(false);
    }
  }, [cognitoConfig, authEmail, authPassword, verificationCode, updateToken]);

  const handleSignOut = useCallback(() => {
    updateToken(null);
    setAllProducts([]);
    setAllOrders([]);
    setSelectedProduct(null);
    setSelectedOrder(null);
    setCrudOut(null);
  }, [updateToken]);

  const handleAddToCart = useCallback(() => {
    const prod = allProducts.find((p) => p.sku === cartSku);
    if (!prod) return;
    const existingIndex = visualCart.findIndex((item) => item.sku === cartSku);
    if (existingIndex >= 0) {
      setVisualCart((prev) => {
        const updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: updated[existingIndex].quantity + cartQty
        };
        return updated;
      });
    } else {
      setVisualCart((prev) => [
        ...prev,
        {
          sku: prod.sku,
          name: prod.name,
          quantity: cartQty,
          unitPriceCents: prod.unitPriceCents
        }
      ]);
    }
    setCartQty(1);
  }, [allProducts, cartSku, cartQty, visualCart]);

  useEffect(() => {
    setAppearance(readStoredAppearance());
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(WIDGET_APPEARANCE_KEY, appearance);
    } catch {
      /* ignore */
    }
  }, [appearance]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => setSystemDark(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  const dark = appearance === 'dark' || (appearance === 'system' && systemDark);

  const theme = useMemo(
    () =>
      dark
        ? {
            bg: '#0f1419',
            surface: '#1a2332',
            surface2: '#243044',
            border: '1px solid rgba(148,163,184,.2)',
            text: '#f1f5f9',
            muted: '#94a3b8',
            primary: '#2563eb',
            primaryHi: '#3b82f6',
            accent: '#f97316',
            danger: '#dc2626',
            success: '#16a34a',
            radius: 10,
            font: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
            shadow: '0 4px 24px rgba(0,0,0,.35)',
            inputBg: '#0c1220',
            heroGradient: 'linear-gradient(145deg, rgba(37,99,235,.14) 0%, rgba(26,35,50,.92) 42%, #1a2332 100%)',
            heroShadow: '0 8px 32px rgba(0,0,0,.35)'
          }
        : {
            bg: '#ffffff',
            surface: '#ffffff',
            surface2: '#f4f4f5',
            border: '1px solid #d4d4d8',
            text: '#09090b',
            muted: '#52525b',
            primary: '#2563eb',
            primaryHi: '#1d4ed8',
            accent: '#ea580c',
            danger: '#dc2626',
            success: '#16a34a',
            radius: 10,
            font: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
            shadow: '0 1px 3px rgba(0,0,0,.08)',
            inputBg: '#ffffff',
            heroGradient: 'linear-gradient(145deg, #fafafa 0%, #ffffff 50%, #f4f4f5 100%)',
            heroShadow: '0 2px 12px rgba(0,0,0,.06)'
          },
    [dark]
  );

  const crudTable = useMemo(() => crudTableView(crudOut), [crudOut]);

  // CSS Styles
  const tabStyle = (active: boolean): CSSProperties => ({
    padding: '12px 20px',
    borderRadius: 8,
    border: 'none',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 14,
    fontFamily: theme.font,
    background: active ? theme.primary : theme.surface2,
    color: active ? '#fff' : theme.text,
    boxShadow: active ? `0 2px 8px ${theme.primary}55` : 'none',
    transition: 'background .15s ease'
  });

  const subTabStyle = (active: boolean): CSSProperties => ({
    padding: '8px 16px',
    borderRadius: 6,
    border: active ? 'none' : theme.border,
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 13,
    fontFamily: theme.font,
    background: active ? (dark ? '#334155' : '#e2e8f0') : 'transparent',
    color: theme.text,
    transition: 'background .15s ease'
  });

  const btn = (variant: 'primary' | 'secondary' | 'danger'): CSSProperties => ({
    padding: '10px 16px',
    borderRadius: 8,
    fontWeight: 600,
    fontSize: 13,
    fontFamily: theme.font,
    border: variant === 'secondary' ? theme.border : 'none',
    cursor: busy ? 'wait' : 'pointer',
    opacity: busy ? 0.65 : 1,
    background: variant === 'primary' ? theme.primary : variant === 'danger' ? theme.danger : theme.surface2,
    color: variant === 'secondary' ? theme.text : '#fff',
    transition: 'background .12s ease'
  });

  const appearanceTabBtn = (mode: WidgetAppearance): CSSProperties => ({
    padding: '7px 11px',
    borderRadius: 6,
    border: appearance === mode ? 'none' : theme.border,
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 11,
    fontFamily: theme.font,
    background: appearance === mode ? theme.primary : theme.surface2,
    color: appearance === mode ? '#fff' : theme.text,
    transition: 'background .12s ease'
  });

  const inputStyle: CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 8,
    border: theme.border,
    background: theme.inputBg,
    color: theme.text,
    fontSize: 14,
    fontFamily: theme.font,
    boxSizing: 'border-box'
  };

  const labelStyle: CSSProperties = {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    color: theme.muted,
    marginBottom: 6,
    letterSpacing: '0.02em'
  };

  const cardStyle: CSSProperties = {
    background: theme.surface,
    border: theme.border,
    borderRadius: theme.radius,
    padding: 20,
    boxShadow: theme.shadow
  };

  const tableBorder: CSSProperties = { border: theme.border, borderCollapse: 'collapse', width: '100%', fontSize: 13 };
  const thStyle: CSSProperties = {
    textAlign: 'left',
    padding: '10px 12px',
    borderBottom: theme.border,
    background: theme.surface2,
    color: theme.muted,
    fontWeight: 600,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.04em'
  };
  const tdKeyStyle: CSSProperties = {
    verticalAlign: 'top',
    padding: '10px 12px',
    borderBottom: theme.border,
    color: theme.muted,
    fontWeight: 600,
    width: '32%',
    wordBreak: 'break-word'
  };
  const tdValStyle: CSSProperties = {
    verticalAlign: 'top',
    padding: '10px 12px',
    borderBottom: theme.border,
    color: theme.text,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 12,
    lineHeight: 1.45
  };

  const helpPara: CSSProperties = { margin: '0 0 14px', fontSize: 14, lineHeight: 1.7, color: theme.muted };
  const helpHeading3 = (text: string) => (
    <h3 style={{ margin: '20px 0 10px', fontSize: 15, fontWeight: 700, color: theme.text }}>{text}</h3>
  );
  const helpHeading4 = (text: string) => (
    <h4 style={{ margin: '16px 0 8px', fontSize: 13, fontWeight: 700, color: theme.text }}>{text}</h4>
  );
  const infoBadge = (fieldName: string, text: string) => {
    const isHovered = hoveredTooltipField === fieldName;
    return (
      <div style={{ position: 'relative', display: 'inline-block', marginLeft: 6, verticalAlign: 'middle' }}>
        <span
          onMouseEnter={() => setHoveredTooltipField(fieldName)}
          onMouseLeave={() => setHoveredTooltipField(null)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: isHovered ? theme.primary : theme.surface2,
            color: isHovered ? '#fff' : theme.muted,
            fontSize: 10,
            fontWeight: 800,
            cursor: 'help',
            border: theme.border,
            transition: 'all 0.15s'
          }}
        >
          i
        </span>
        {isHovered && (
          <div
            style={{
              position: 'absolute',
              bottom: '125%',
              left: '50%',
              transform: 'translateX(-50%)',
              background: '#1e293b',
              color: '#f8fafc',
              padding: '8px 12px',
              borderRadius: 6,
              fontSize: 11,
              width: 220,
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              zIndex: 100,
              pointerEvents: 'none',
              lineHeight: 1.4,
              border: '1px solid rgba(255,255,255,0.1)'
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 4, color: theme.accent }}>{fieldName}</div>
            {text}
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: '50%',
                transform: 'translateX(-50%)',
                borderWidth: 5,
                borderStyle: 'solid',
                borderColor: '#1e293b transparent transparent transparent'
              }}
            />
          </div>
        )}
      </div>
    );
  };
  if (!mounted) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f1419', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, border: '3px solid rgba(148,163,184,0.1)', borderTop: '3px solid #2563eb', borderRadius: '50%', margin: '0 auto 12px', animation: 'spin 1s linear infinite' }} />
          <div>Loading NitroStudio Supply Control Plane...</div>
        </div>
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}} />
      </div>
    );
  }

  if (!token) {
    return (
      <div
        style={{
          minHeight: '100vh',
          fontFamily: theme.font,
          color: theme.text,
          background: theme.bg,
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <style>{`
          @keyframes ns-spin {
            to { transform: rotate(360deg); }
          }
          @keyframes ns-slide-up {
            from { opacity: 0; transform: translateY(16px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes ns-slide-down {
            from { opacity: 0; transform: translateY(-12px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
        
        {/* Simple Top Header with Theme Switcher */}
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 24px',
            borderBottom: theme.border,
            background: theme.surface,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>📦</span>
            <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: '0.05em', color: theme.accent }}>
              NITROSTACK SUPPLY PORTAL
            </span>
          </div>
          <div role="group" aria-label="Widget theme" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: theme.muted, fontWeight: 700, marginRight: 4 }}>Theme</span>
            <button type="button" style={appearanceTabBtn('light')} onClick={() => setAppearance('light')}>
              Light
            </button>
            <button type="button" style={appearanceTabBtn('dark')} onClick={() => setAppearance('dark')}>
              Dark
            </button>
            <button type="button" style={appearanceTabBtn('system')} onClick={() => setAppearance('system')}>
              System
            </button>
          </div>
        </header>

        {/* Center Panel container */}
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20,
          background: theme.heroGradient,
        }}>
          {loadingConfig ? (
            <div style={{
              ...cardStyle,
              maxWidth: 440,
              width: '100%',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 20,
              padding: 40
            }}>
              <div style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                border: `3px solid ${theme.surface2}`,
                borderTopColor: theme.primary,
                animation: 'ns-spin 1s linear infinite'
              }} />
              <h3 style={{ margin: 0, fontSize: 18, color: theme.text }}>Establishing OIDC Handshake...</h3>
              <p style={{ margin: 0, fontSize: 13, color: theme.muted }}>
                Querying local MCP authority for AWS Cognito details...
              </p>
            </div>
          ) : !cognitoConfig ? (
            <div style={{
              ...cardStyle,
              maxWidth: 500,
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              padding: 30
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: theme.danger }}>
                <span style={{ fontSize: 24 }}>⚠️</span>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Cognito Client ID Missing</h3>
              </div>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: theme.muted }}>
                The MCP server could not resolve the required Cognito environment variables or public configurations.
              </p>
              <div style={{ background: theme.surface2, padding: 16, borderRadius: 8, border: theme.border, fontSize: 13 }}>
                <strong style={{ color: theme.text, display: 'block', marginBottom: 6 }}>Required Variables (.env):</strong>
                <code style={{ display: 'block', color: theme.accent, fontFamily: 'monospace', marginBottom: 4 }}>
                  VITE_COGNITO_AUTHORITY=https://cognito-idp.[region].amazonaws.com/[user-pool-id]
                </code>
                <code style={{ display: 'block', color: theme.accent, fontFamily: 'monospace', marginBottom: 4 }}>
                  VITE_COGNITO_WEB_CLIENT_ID=[client-id]
                </code>
                <code style={{ display: 'block', color: theme.accent, fontFamily: 'monospace' }}>
                  VITE_AWS_HTTP_API_BASE_URL=[api-base-url]
                </code>
              </div>
              <p style={{ margin: 0, fontSize: 12, color: theme.muted }}>
                Please confirm that your <code style={{ color: theme.accent }}>.env</code> file has been set up with Cognito parameters and that the MCP server has been restarted.
              </p>
            </div>
          ) : (
            <div style={{
              ...cardStyle,
              maxWidth: 440,
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: 24,
              padding: '36px 30px',
              animation: 'ns-slide-up 0.3s ease-out'
            }}>
              {/* Logo / Header inside card */}
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 50,
                  height: 50,
                  borderRadius: 12,
                  background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                  color: '#fff',
                  fontSize: 24,
                  marginBottom: 16,
                  boxShadow: '0 4px 12px rgba(37,99,235,0.3)'
                }}>
                  🔐
                </div>
                <h2 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 800, color: theme.text }}>
                  {authMode === 'sign_in' && 'Secure Portal Login'}
                  {authMode === 'sign_up' && 'Create Secure Account'}
                  {authMode === 'confirm_code' && 'Verify Account'}
                </h2>
                <p style={{ margin: 0, fontSize: 13, color: theme.muted }}>
                  {authMode === 'sign_in' && 'Direct AWS Cognito User Pool Authentication'}
                  {authMode === 'sign_up' && 'Register direct browser credentials'}
                  {authMode === 'confirm_code' && `Verification code sent to ${authEmail}`}
                </p>
              </div>

              {/* Error Banner */}
              {authError && (
                <div style={{
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: `1px solid rgba(239, 68, 68, 0.3)`,
                  borderRadius: 8,
                  padding: '12px 16px',
                  fontSize: 13,
                  color: '#fca5a5',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10
                }}>
                  <span style={{ color: '#ef4444', fontWeight: 'bold' }}>!</span>
                  <div style={{ flex: 1, wordBreak: 'break-word' }}>{authError}</div>
                </div>
              )}

              {/* Tabs Switcher for sign_in and sign_up */}
              {authMode !== 'confirm_code' && (
                <div style={{
                  display: 'flex',
                  background: theme.surface2,
                  padding: 4,
                  borderRadius: 8,
                  border: theme.border
                }}>
                  <button
                    type="button"
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: 'none',
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontSize: 13,
                      fontFamily: theme.font,
                      background: authMode === 'sign_in' ? theme.surface : 'transparent',
                      color: authMode === 'sign_in' ? theme.text : theme.muted,
                      transition: 'all 0.15s ease'
                    }}
                    onClick={() => {
                      setAuthMode('sign_in');
                      setAuthError(null);
                    }}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: 'none',
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontSize: 13,
                      fontFamily: theme.font,
                      background: authMode === 'sign_up' ? theme.surface : 'transparent',
                      color: authMode === 'sign_up' ? theme.text : theme.muted,
                      transition: 'all 0.15s ease'
                    }}
                    onClick={() => {
                      setAuthMode('sign_up');
                      setAuthError(null);
                    }}
                  >
                    Sign Up
                  </button>
                </div>
              )}

              {/* Form */}
              <form onSubmit={
                authMode === 'sign_in' ? handleCognitoSignIn :
                authMode === 'sign_up' ? handleCognitoSignUp :
                handleCognitoConfirmSignUp
              } style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                
                {authMode !== 'confirm_code' ? (
                  <>
                    <div>
                      <label style={labelStyle}>COGNITO ACCOUNT EMAIL</label>
                      <input
                        type="email"
                        required
                        placeholder="you@domain.com"
                        style={inputStyle}
                        value={authEmail}
                        onChange={(e) => setAuthEmail(e.target.value)}
                        disabled={authLoading}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>PASSWORD</label>
                      <input
                        type="password"
                        required
                        placeholder="••••••••"
                        style={inputStyle}
                        value={authPassword}
                        onChange={(e) => setAuthPassword(e.target.value)}
                        disabled={authLoading}
                      />
                    </div>
                  </>
                ) : (
                  <div>
                    <label style={labelStyle}>6-DIGIT VERIFICATION CODE</label>
                    <input
                      type="text"
                      required
                      maxLength={6}
                      pattern="[0-9]{6}"
                      placeholder="e.g. 123456"
                      style={{
                        ...inputStyle,
                        letterSpacing: '0.5em',
                        textAlign: 'center',
                        fontSize: 18,
                        fontWeight: 700
                      }}
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                      disabled={authLoading}
                    />
                    <p style={{ margin: '6px 0 0', fontSize: 11, color: theme.muted, textAlign: 'center' }}>
                      Check your email inbox for the registration verification code.
                    </p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={authLoading}
                  style={{
                    ...btn('primary'),
                    padding: '12px 16px',
                    fontSize: 14,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    marginTop: 8
                  }}
                >
                  {authLoading ? (
                    <>
                      <div style={{
                        width: 16,
                        height: 16,
                        borderRadius: '50%',
                        border: '2px solid rgba(255,255,255,0.2)',
                        borderTopColor: '#fff',
                        animation: 'ns-spin 0.6s linear infinite'
                      }} />
                      Securing session...
                    </>
                  ) : (
                    <>
                      {authMode === 'sign_in' && '🔓 Authenticate & Launch NitroStudio'}
                      {authMode === 'sign_up' && '✉️ Register New Portal User'}
                      {authMode === 'confirm_code' && '✓ Verify Account & Log In'}
                    </>
                  )}
                </button>

                {authMode === 'confirm_code' && (
                  <button
                    type="button"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: theme.muted,
                      cursor: 'pointer',
                      fontSize: 12,
                      textDecoration: 'underline',
                      fontFamily: theme.font,
                      textAlign: 'center',
                      marginTop: 4
                    }}
                    onClick={() => {
                      setAuthMode('sign_in');
                      setAuthError(null);
                    }}
                    disabled={authLoading}
                  >
                    Back to Sign In
                  </button>
                )}
              </form>

              {/* Info panel explaining the architecture */}
              <div style={{
                background: theme.surface2,
                borderRadius: 8,
                padding: 12,
                border: theme.border,
                fontSize: 11,
                lineHeight: 1.45,
                color: theme.muted
              }}>
                🔑 <strong>No Local AWS Credentials Needed!</strong> NitroStudio handles your connection directly using your Cognito JWT from the browser. The local MCP server only acts as a secure pass-through routing OIDC ID Token headers.
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        fontFamily: theme.font,
        color: theme.text,
        background: theme.bg,
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <style>{`
        @keyframes ns-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes ns-slide-up {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes ns-slide-down {
          from { opacity: 0; transform: translateY(-12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      {/* Dynamic Theme and Tab Header */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 10,
          padding: '16px 20px',
          borderBottom: theme.border,
          background: theme.surface,
          boxShadow: dark ? '0 4px 12px rgba(0,0,0,.4)' : '0 4px 12px rgba(0,0,0,.06)'
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
          <button type="button" onClick={() => setMainTab('search_browse')} style={tabStyle(mainTab === 'search_browse')}>
            Search &amp; Browse
          </button>
          <button type="button" onClick={() => setMainTab('create_order')} style={tabStyle(mainTab === 'create_order')}>
            Create Order
          </button>
          <button type="button" onClick={() => setMainTab('help')} style={tabStyle(mainTab === 'help')}>
            Help / manual
          </button>
        </div>
        <div style={{ flex: 1, minWidth: 12 }} aria-hidden />
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16 }}>
          <button
            type="button"
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              background: 'none',
              border: `1px solid ${theme.danger}`,
              color: theme.danger,
              fontWeight: 600,
              fontSize: 12,
              cursor: 'pointer',
              fontFamily: theme.font,
              transition: 'all 0.15s ease'
            }}
            onClick={handleSignOut}
          >
            🚪 Sign Out
          </button>
          <div role="group" aria-label="Widget theme" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: theme.muted, fontWeight: 700 }}>Theme</span>
            <button type="button" style={appearanceTabBtn('light')} onClick={() => setAppearance('light')}>
              Light
            </button>
            <button type="button" style={appearanceTabBtn('dark')} onClick={() => setAppearance('dark')}>
              Dark
            </button>
            <button type="button" style={appearanceTabBtn('system')} onClick={() => setAppearance('system')} title="Match system light or dark mode">
              System
            </button>
          </div>
        </div>
      </header>

      {/* Main Area */}
      <div style={{ flex: 1, padding: 20, overflow: 'auto' }}>
        {/* ERROR STATE ALERT BANNER */}
        {errorState && (
          <div
            style={{
              background: dark ? 'rgba(239, 68, 68, 0.08)' : 'rgba(254, 242, 242, 0.98)',
              border: `1px solid ${dark ? 'rgba(239, 68, 68, 0.3)' : 'rgba(252, 165, 165, 0.6)'}`,
              borderRadius: theme.radius,
              padding: '16px 20px',
              marginBottom: 20,
              maxWidth: 920,
              boxShadow: dark ? '0 4px 20px rgba(0,0,0,0.3)' : '0 4px 15px rgba(239,68,68,0.04)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              position: 'relative',
              animation: 'ns-slide-down 0.25s ease-out'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  background: 'rgba(239, 68, 68, 0.15)',
                  color: '#ef4444',
                  fontSize: 14,
                  fontWeight: 'bold'
                }}>!</span>
                <strong style={{ fontSize: 15, color: dark ? '#fecaca' : '#991b1b', fontWeight: 700 }}>
                  AWS Integration Status: Action Required
                </strong>
              </div>
              <button
                type="button"
                onClick={() => setErrorState(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: theme.muted,
                  cursor: 'pointer',
                  fontSize: 16,
                  padding: 4
                }}
                title="Dismiss alert"
              >
                ✕
              </button>
            </div>

            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: dark ? '#fca5a5' : '#7f1d1d' }}>
              We encountered a validation or connection failure when communicating with your AWS stack. This usually indicates that the temporary credentials configured in <code style={{ fontFamily: 'monospace', padding: '2px 4px', background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', borderRadius: 4 }}>.env</code> have expired or the AWS Secrets Manager service cannot be reached.
            </p>

            <div style={{
              background: dark ? 'rgba(0, 0, 0, 0.25)' : 'rgba(254, 226, 226, 0.5)',
              borderLeft: `3px solid #ef4444`,
              padding: '10px 14px',
              borderRadius: 4,
              fontSize: 12,
              fontFamily: 'monospace',
              color: dark ? '#f87171' : '#b91c1c',
              wordBreak: 'break-all'
            }}>
              <strong>Error Message:</strong> {errorState.message}
              {errorState.correlationId && (
                <div style={{ marginTop: 4 }}>
                  <strong>Correlation ID:</strong> {errorState.correlationId}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 4 }}>
              <button
                type="button"
                disabled={busy}
                style={{
                  padding: '8px 14px',
                  borderRadius: 6,
                  background: '#ef4444',
                  color: 'white',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                  boxShadow: '0 2px 4px rgba(239, 68, 68, 0.2)',
                  transition: 'background 0.15s'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#dc2626')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#ef4444')}
                onClick={async () => {
                  setBusy(true);
                  setErrorState(null);
                  try {
                    // Try to re-fetch both
                    const r1 = await callSecureTool('catalog_list');
                    if (r1 && typeof r1 === 'object') {
                      const error = (r1 as any).error;
                      if (error) {
                        setErrorState({ message: error, correlationId: (r1 as any).correlationId });
                      } else {
                        const data = (r1 as any).data || (r1 as any).structuredContent?.data || r1;
                        const products = Array.isArray(data) ? data : (data && Array.isArray((data as any).products) ? (data as any).products : []);
                        setAllProducts(products);
                      }
                    }
                    const r2 = await callSecureTool('order_list');
                    if (r2 && typeof r2 === 'object') {
                      const error = (r2 as any).error;
                      if (error) {
                        setErrorState({ message: error, correlationId: (r2 as any).correlationId });
                      } else {
                        const data = (r2 as any).data || (r2 as any).structuredContent?.data || r2;
                        const orders = Array.isArray(data) ? data : (data && Array.isArray((data as any).orders) ? (data as any).orders : []);
                        setAllOrders(orders);
                      }
                    }
                  } catch (err) {
                    setErrorState({ message: err instanceof Error ? err.message : String(err) });
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                🔄 Retry Connection
              </button>

              <button
                type="button"
                style={{
                  padding: '8px 14px',
                  borderRadius: 6,
                  background: 'none',
                  color: dark ? '#fca5a5' : '#b91c1c',
                  border: `1px solid ${dark ? 'rgba(239, 68, 68, 0.3)' : 'rgba(252, 165, 165, 0.6)'}`,
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                  transition: 'background 0.15s'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = dark ? 'rgba(239, 68, 68, 0.1)' : 'rgba(254, 226, 226, 0.8)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                onClick={() => setMainTab('help')}
              >
                📖 View Setup Guide
              </button>
            </div>
          </div>
        )}

        {/* Showcase Hero Banner */}
        <section
          aria-label="Project showcase"
          style={{
            position: 'relative',
            margin: '0 0 20px',
            padding: '18px 20px',
            paddingRight: 86,
            borderRadius: theme.radius,
            background: theme.heroGradient,
            border: theme.border,
            boxShadow: theme.heroShadow,
            maxWidth: 920
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 12,
              right: 12,
              opacity: 0.98,
              pointerEvents: 'none',
              filter: dark
                ? 'drop-shadow(5px 12px 8px rgba(0,0,0,.5)) drop-shadow(0 0 18px rgba(59,130,246,.4))'
                : 'drop-shadow(8px 14px 0 rgba(37,99,235,.1)) drop-shadow(4px 8px 12px rgba(15,23,42,.18))'
            }}
            aria-hidden
          >
            <ShowcaseLogoMark primary={theme.primary} accent={theme.accent} darkMode={dark} />
          </div>
          <p
            style={{
              margin: '0 0 6px',
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: theme.primaryHi
            }}
          >
            Showcase · AWS Supply Chain MCP
          </p>
          <h1
            style={{
              margin: '0 0 10px',
              fontSize: 26,
              fontWeight: 800,
              letterSpacing: '-0.035em',
              lineHeight: 1.12,
              color: theme.text
            }}
          >
            {HERO_HEADLINE}{' '}
            <span style={{ color: theme.primaryHi, textShadow: dark ? '0 0 28px rgba(59,130,246,.35)' : 'none' }}>{HERO_HEADLINE_ACCENT}</span>
          </h1>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {HERO_CAPABILITY_CHIPS.map((label) => (
              <span
                key={label}
                style={{
                  display: 'inline-block',
                  padding: '4px 9px',
                  borderRadius: 6,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.02em',
                  border: dark ? '1px solid rgba(59,130,246,.45)' : '1px solid rgba(37,99,235,.35)',
                  background: dark ? 'rgba(37,99,235,.18)' : 'rgba(37,99,235,.09)',
                  color: dark ? '#e0e7ff' : '#1e3a8a'
                }}
              >
                {label}
              </span>
            ))}
          </div>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: theme.muted, maxWidth: 800 }}>{HERO_TAGLINE}</p>
        </section>

        {/* Tab 1: Search & Browse */}
        {mainTab === 'search_browse' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Product Catalog Section */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 20 }}>
              {/* Catalog Search & List */}
              <div style={cardStyle}>
                <h2 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, color: theme.text }}>
                  📦 Catalog Explorer
                </h2>
                <p style={{ margin: '0 0 16px', fontSize: 13, color: theme.muted }}>
                  Fuzzy search and list real-time product entries from DynamoDB.
                </p>

                {/* Lexical Search Bar with Autocomplete Dropdown */}
                <div style={{ position: 'relative', marginBottom: 16 }}>
                  <label style={labelStyle}>Lexical Search (SKU or Name)</label>
                  <div style={{ display: 'flex', gap: 6, position: 'relative' }}>
                    <input
                      type="text"
                      placeholder="Type SKU, name, or '*' for all..."
                      value={productSearch}
                      onChange={(e) => {
                        setProductSearch(e.target.value);
                        setShowProductDropdown(true);
                        lazyLoadProducts();
                      }}
                      onFocus={() => {
                        setShowProductDropdown(true);
                        lazyLoadProducts();
                      }}
                      style={{ ...inputStyle, paddingRight: 40 }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setShowProductDropdown(!showProductDropdown);
                        lazyLoadProducts();
                      }}
                      onMouseEnter={lazyLoadProducts}
                      style={{
                        position: 'absolute',
                        right: 8,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: theme.muted,
                        fontSize: 12,
                        padding: 4
                      }}
                      title="Show all catalog items"
                    >
                      {showProductDropdown ? '▲' : '▼'}
                    </button>
                  </div>
                  {showProductDropdown && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        background: theme.surface,
                        border: theme.border,
                        borderRadius: 8,
                        boxShadow: theme.shadow,
                        zIndex: 50,
                        maxHeight: 200,
                        overflowY: 'auto',
                        marginTop: 4
                      }}
                    >
                      {(() => {
                        if (loadingProducts) {
                          return (
                            <div style={{ padding: '12px', fontSize: 13, color: theme.primaryHi, display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span className="ns-spinner" style={{
                                width: 14,
                                height: 14,
                                borderRadius: '50%',
                                border: `2px solid ${theme.primary}22`,
                                borderTopColor: theme.primary,
                                animation: 'ns-spin 0.8s linear infinite'
                              }} />
                              Syncing database values...
                            </div>
                          );
                        }
                        const q = productSearch.trim().toLowerCase();
                        const list = (!q || q === '*' || q.includes('*'))
                          ? allProducts
                          : allProducts.filter(
                              (p) => p.sku.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)
                            );
                        if (list.length === 0) {
                          return (
                            <div style={{ padding: '10px 12px', fontSize: 13, color: theme.muted }}>
                              No matching products found. Click "Refresh Catalog" to fetch database values.
                            </div>
                          );
                        }
                        return list.map((p) => (
                          <button
                            key={p.productId}
                            type="button"
                            onClick={() => handleSelectProduct(p)}
                            style={{
                              display: 'block',
                              width: '100%',
                              padding: '10px 12px',
                              textAlign: 'left',
                              background: 'none',
                              border: 'none',
                              borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}`,
                              cursor: 'pointer',
                              fontSize: 13,
                              color: theme.text,
                              transition: 'background 0.15s ease'
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = theme.surface2)}
                            onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                          >
                            <span style={{ fontWeight: 600, color: theme.primaryHi }}>{p.sku}</span> — {p.name} (${(p.unitPriceCents / 100).toFixed(2)})
                          </button>
                        ));
                      })()}
                    </div>
                  )}

                  {/* Suggestion Chips */}
                  <div onMouseEnter={lazyLoadProducts} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    <span style={{ fontSize: 11, color: theme.muted, display: 'inline-flex', alignItems: 'center', marginRight: 4 }}>
                      Suggestions:
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setProductSearch('*');
                        setShowProductDropdown(false);
                        lazyLoadProducts();
                      }}
                      style={{
                        padding: '3px 8px',
                        borderRadius: 6,
                        fontSize: 10,
                        fontWeight: 700,
                        border: theme.border,
                        background: productSearch === '*' ? theme.primary : theme.surface2,
                        color: productSearch === '*' ? '#fff' : theme.text,
                        cursor: 'pointer'
                      }}
                    >
                      * (All)
                    </button>
                    {allProducts.slice(0, 3).map((p) => (
                      <button
                        key={p.productId}
                        type="button"
                        onClick={() => {
                          setProductSearch(p.sku);
                          setShowProductDropdown(false);
                          handleSelectProduct(p);
                        }}
                        style={{
                          padding: '3px 8px',
                          borderRadius: 6,
                          fontSize: 10,
                          fontWeight: 700,
                          border: theme.border,
                          background: productSearch === p.sku ? theme.primary : theme.surface2,
                          color: productSearch === p.sku ? '#fff' : theme.text,
                          cursor: 'pointer'
                        }}
                      >
                        📦 {p.sku}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Products Grid Table */}
                <div style={{ maxHeight: 220, overflowY: 'auto', border: theme.border, borderRadius: 8 }}>
                  <table style={{ ...tableBorder, border: 'none', minWidth: '100%' }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>SKU</th>
                        <th style={thStyle}>Name</th>
                        <th style={thStyle}>Unit Price</th>
                      </tr>
                    </thead>
                    <tbody>
                       {loadingProducts ? (
                        <tr>
                          <td colSpan={3} style={{ ...tdValStyle, textAlign: 'center', color: theme.primaryHi }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, justifyContent: 'center', padding: '12px' }}>
                              <span className="ns-spinner" style={{
                                width: 12,
                                height: 12,
                                borderRadius: '50%',
                                border: `2px solid ${theme.primary}22`,
                                borderTopColor: theme.primary,
                                animation: 'ns-spin 0.8s linear infinite'
                              }} />
                              Synchronizing catalog...
                            </div>
                          </td>
                        </tr>
                      ) : allProducts.length === 0 ? (
                        <tr>
                          <td colSpan={3} style={{ ...tdValStyle, textAlign: 'center', color: theme.muted }}>
                            No products cached. Click "Refresh Catalog" below to load.
                          </td>
                        </tr>
                      ) : filteredProducts.length === 0 ? (
                        <tr>
                          <td colSpan={3} style={{ ...tdValStyle, textAlign: 'center', color: theme.muted }}>
                            No matching products found.
                          </td>
                        </tr>
                      ) : (
                        filteredProducts.map((p) => {
                          const isSelected = selectedProduct?.productId === p.productId;
                          return (
                            <tr
                              key={p.productId}
                              onClick={() => handleSelectProduct(p)}
                              style={{
                                cursor: 'pointer',
                                background: isSelected ? (dark ? 'rgba(37,99,235,0.15)' : 'rgba(37,99,235,0.08)') : 'none',
                                transition: 'background 0.15s'
                              }}
                              onMouseEnter={(e) => {
                                if (!isSelected) e.currentTarget.style.background = theme.surface2;
                              }}
                              onMouseLeave={(e) => {
                                if (!isSelected) e.currentTarget.style.background = 'none';
                              }}
                            >
                              <td style={{ ...tdValStyle, fontWeight: 600, color: theme.primaryHi }}>{p.sku}</td>
                              <td style={tdValStyle}>{p.name}</td>
                              <td style={tdValStyle}>${(p.unitPriceCents / 100).toFixed(2)}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    disabled={busy}
                    style={btn('secondary')}
                    onClick={async () => {
                      setBusy(true);
                      setErrorState(null);
                      try {
                        const r = await callSecureTool('catalog_list');
                        if (r && typeof r === 'object') {
                          const error = (r as any).error;
                          if (error) {
                            setErrorState({ message: error, correlationId: (r as any).correlationId });
                          } else {
                            const data = (r as any).data || (r as any).structuredContent?.data || r;
                            const products = Array.isArray(data) ? data : (data && Array.isArray((data as any).products) ? (data as any).products : []);
                            setAllProducts(products);
                          }
                        }
                      } catch (err) {
                        console.error(err);
                        setErrorState({ message: err instanceof Error ? err.message : String(err) });
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    🔄 Refresh Catalog
                  </button>
                </div>
              </div>

              {/* Selected Product Detail Card */}
              <div style={cardStyle}>
                <h2 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, color: theme.text }}>
                  🔎 Product Details
                </h2>
                <p style={{ margin: '0 0 16px', fontSize: 13, color: theme.muted }}>
                  Detailed record of the selected catalog product.
                </p>

                {selectedProduct ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${theme.surface2}`, paddingBottom: 8 }}>
                      <span style={{ fontSize: 13, color: theme.muted, fontWeight: 600 }}>Product ID:</span>
                      <span style={{ fontSize: 13, color: theme.text, fontFamily: 'monospace' }}>{selectedProduct.productId}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${theme.surface2}`, paddingBottom: 8 }}>
                      <span style={{ fontSize: 13, color: theme.muted, fontWeight: 600 }}>SKU Code:</span>
                      <span style={{ fontSize: 13, color: theme.primaryHi, fontWeight: 700 }}>{selectedProduct.sku}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${theme.surface2}`, paddingBottom: 8 }}>
                      <span style={{ fontSize: 13, color: theme.muted, fontWeight: 600 }}>Name:</span>
                      <span style={{ fontSize: 13, color: theme.text, fontWeight: 600 }}>{selectedProduct.name}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${theme.surface2}`, paddingBottom: 8 }}>
                      <span style={{ fontSize: 13, color: theme.muted, fontWeight: 600 }}>Unit Price:</span>
                      <span style={{ fontSize: 14, color: theme.accent, fontWeight: 700 }}>${(selectedProduct.unitPriceCents / 100).toFixed(2)}</span>
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: '24px 0', textAlign: 'center', color: theme.muted, fontSize: 13 }}>
                    Select a product from the left catalog or use search to inspect details.
                  </div>
                )}
              </div>
            </div>

            {/* Orders List & Hierarchy Section */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 20 }}>
              {/* Historical Orders List */}
              <div style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: theme.text }}>
                    📜 Order Transactions
                  </h2>
                  <button type="button" disabled={busy} style={btn('secondary')} onClick={loadOrdersList}>
                    {busy && currentAction === 'order_list' ? 'Loading...' : '🔄 Load Orders'}
                  </button>
                </div>
                <p style={{ margin: '0 0 16px', fontSize: 13, color: theme.muted }}>
                  Browse system orders stored in Amazon DynamoDB.
                </p>

                {/* Lexical Search Bar with Autocomplete Dropdown for Orders */}
                <div style={{ position: 'relative', marginBottom: 16 }}>
                  <label style={labelStyle}>Search Orders (ID, Customer, or Status)</label>
                  <div style={{ display: 'flex', gap: 6, position: 'relative' }}>
                    <input
                      type="text"
                      placeholder="Type Order ID, Customer, or '*' for all..."
                      value={orderSearch}
                      onChange={(e) => {
                        setOrderSearch(e.target.value);
                        setShowOrderDropdown(true);
                        lazyLoadOrders();
                      }}
                      onFocus={() => {
                        setShowOrderDropdown(true);
                        lazyLoadOrders();
                      }}
                      style={{ ...inputStyle, paddingRight: 40 }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setShowOrderDropdown(!showOrderDropdown);
                        lazyLoadOrders();
                      }}
                      onMouseEnter={lazyLoadOrders}
                      style={{
                        position: 'absolute',
                        right: 8,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: theme.muted,
                        fontSize: 12,
                        padding: 4
                      }}
                      title="Show all order transactions"
                    >
                      {showOrderDropdown ? '▲' : '▼'}
                    </button>
                  </div>
                  {showOrderDropdown && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        background: theme.surface,
                        border: theme.border,
                        borderRadius: 8,
                        boxShadow: theme.shadow,
                        zIndex: 50,
                        maxHeight: 200,
                        overflowY: 'auto',
                        marginTop: 4
                      }}
                    >
                      {(() => {
                        if (loadingOrders) {
                          return (
                            <div style={{ padding: '12px', fontSize: 13, color: theme.primaryHi, display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span className="ns-spinner" style={{
                                width: 14,
                                height: 14,
                                borderRadius: '50%',
                                border: `2px solid ${theme.primary}22`,
                                borderTopColor: theme.primary,
                                animation: 'ns-spin 0.8s linear infinite'
                              }} />
                              Retrieving transactions...
                            </div>
                          );
                        }
                        const q = orderSearch.trim().toLowerCase();
                        const list = (!q || q === '*' || q.includes('*'))
                          ? allOrders
                          : allOrders.filter((ord) => 
                              ord.orderId.toLowerCase().includes(q) ||
                              ord.customerRef.toLowerCase().includes(q) ||
                              ord.status.toLowerCase() === q
                            );
                        if (list.length === 0) {
                          return (
                            <div style={{ padding: '10px 12px', fontSize: 13, color: theme.muted }}>
                              No matching orders found. Click "Load Orders" to fetch from database.
                            </div>
                          );
                        }
                        return list.map((ord) => (
                          <button
                            key={ord.orderId}
                            type="button"
                            onClick={() => {
                              handleSelectOrder(ord);
                              setOrderSearch(ord.orderId);
                              setShowOrderDropdown(false);
                            }}
                            style={{
                              display: 'block',
                              width: '100%',
                              padding: '10px 12px',
                              textAlign: 'left',
                              background: 'none',
                              border: 'none',
                              borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}`,
                              cursor: 'pointer',
                              fontSize: 13,
                              color: theme.text,
                              transition: 'background 0.15s ease'
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = theme.surface2)}
                            onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                          >
                            <span style={{ fontWeight: 600, color: theme.primaryHi }}>
                              {ord.orderId.substring(0, 8)}...
                            </span>{' '}
                            ({ord.customerRef}) —{' '}
                            <span style={{ color: ord.status === 'CANCELLED' ? theme.danger : theme.success, fontWeight: 700 }}>
                              {ord.status}
                            </span>
                          </button>
                        ));
                      })()}
                    </div>
                  )}

                  {/* Suggestion Chips */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    <span style={{ fontSize: 11, color: theme.muted, display: 'inline-flex', alignItems: 'center', marginRight: 4 }}>
                      Suggestions:
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setOrderSearch('*');
                        setShowOrderDropdown(false);
                      }}
                      style={{
                        padding: '3px 8px',
                        borderRadius: 6,
                        fontSize: 10,
                        fontWeight: 700,
                        border: theme.border,
                        background: orderSearch === '*' ? theme.primary : theme.surface2,
                        color: orderSearch === '*' ? '#fff' : theme.text,
                        cursor: 'pointer'
                      }}
                    >
                      * (All)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOrderSearch('CONFIRMED');
                        setShowOrderDropdown(false);
                      }}
                      style={{
                        padding: '3px 8px',
                        borderRadius: 6,
                        fontSize: 10,
                        fontWeight: 700,
                        border: theme.border,
                        background: orderSearch === 'CONFIRMED' ? theme.primary : theme.surface2,
                        color: orderSearch === 'CONFIRMED' ? '#fff' : theme.text,
                        cursor: 'pointer'
                      }}
                    >
                      CONFIRMED
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOrderSearch('CANCELLED');
                        setShowOrderDropdown(false);
                      }}
                      style={{
                        padding: '3px 8px',
                        borderRadius: 6,
                        fontSize: 10,
                        fontWeight: 700,
                        border: theme.border,
                        background: orderSearch === 'CANCELLED' ? theme.primary : theme.surface2,
                        color: orderSearch === 'CANCELLED' ? '#fff' : theme.text,
                        cursor: 'pointer'
                      }}
                    >
                      CANCELLED
                    </button>
                    {/* Unique customer reference chips from loaded orders */}
                    {Array.from(new Set(allOrders.map((o) => o.customerRef))).slice(0, 3).map((cust) => (
                      <button
                        key={cust}
                        type="button"
                        onClick={() => {
                          setOrderSearch(cust);
                          setShowOrderDropdown(false);
                        }}
                        style={{
                          padding: '3px 8px',
                          borderRadius: 6,
                          fontSize: 10,
                          fontWeight: 700,
                          border: theme.border,
                          background: orderSearch === cust ? theme.primary : theme.surface2,
                          color: orderSearch === cust ? '#fff' : theme.text,
                          cursor: 'pointer'
                        }}
                      >
                        👤 {cust}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ maxHeight: 300, overflowY: 'auto', border: theme.border, borderRadius: 8 }}>
                  <table style={{ ...tableBorder, border: 'none', minWidth: '100%' }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Order ID</th>
                        <th style={thStyle}>Customer</th>
                        <th style={thStyle}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allOrders.length === 0 ? (
                        <tr>
                          <td colSpan={3} style={{ ...tdValStyle, textAlign: 'center', color: theme.muted }}>
                            No orders listed yet. Click "Load Orders" to fetch transactions.
                          </td>
                        </tr>
                      ) : filteredOrders.length === 0 ? (
                        <tr>
                          <td colSpan={3} style={{ ...tdValStyle, textAlign: 'center', color: theme.muted }}>
                            No matching orders found.
                          </td>
                        </tr>
                      ) : (
                        filteredOrders.map((ord) => {
                          const isSelected = selectedOrder?.orderId === ord.orderId;
                          const isCancelled = ord.status === 'CANCELLED';
                          return (
                            <tr
                              key={ord.orderId}
                              onClick={() => handleSelectOrder(ord)}
                              style={{
                                cursor: 'pointer',
                                background: isSelected ? (dark ? 'rgba(37,99,235,0.15)' : 'rgba(37,99,235,0.08)') : 'none',
                                transition: 'background 0.15s'
                              }}
                              onMouseEnter={(e) => {
                                if (!isSelected) e.currentTarget.style.background = theme.surface2;
                              }}
                              onMouseLeave={(e) => {
                                if (!isSelected) e.currentTarget.style.background = 'none';
                              }}
                            >
                              <td style={{ ...tdValStyle, fontWeight: 600, color: theme.primaryHi }}>
                                {ord.orderId.substring(0, 8)}...
                              </td>
                              <td style={tdValStyle}>{ord.customerRef}</td>
                              <td style={tdValStyle}>
                                <span
                                  style={{
                                    padding: '3px 8px',
                                    borderRadius: 6,
                                    fontSize: 10,
                                    fontWeight: 700,
                                    background: isCancelled ? 'rgba(220,38,38,0.15)' : 'rgba(22,163,74,0.15)',
                                    color: isCancelled ? theme.danger : theme.success
                                  }}
                                >
                                  {ord.status}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Selected Order Details (Parent/Child Hierarchy) */}
              <div style={cardStyle}>
                <h2 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, color: theme.text }}>
                  🔗 Transaction Parent/Child Hierarchy
                </h2>
                <p style={{ margin: '0 0 16px', fontSize: 13, color: theme.muted }}>
                  Top table shows the Parent metadata, and bottom table details Child line items.
                </p>

                {selectedOrder ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Top Table: Parent Attributes */}
                    <div>
                      <h3 style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: theme.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Parent Record (Order Metadata)
                      </h3>
                      <table style={{ ...tableBorder, width: '100%' }}>
                        <tbody>
                          <tr>
                            <td style={tdKeyStyle}>Order ID</td>
                            <td style={tdValStyle}>{selectedOrder.orderId}</td>
                          </tr>
                          <tr>
                            <td style={tdKeyStyle}>Customer ID</td>
                            <td style={tdValStyle}>{selectedOrder.customerRef}</td>
                          </tr>
                          <tr>
                            <td style={tdKeyStyle}>Status</td>
                            <td style={tdValStyle}>
                              <span
                                style={{
                                  padding: '3px 8px',
                                  borderRadius: 6,
                                  fontSize: 11,
                                  fontWeight: 700,
                                  background: selectedOrder.status === 'CANCELLED' ? 'rgba(220,38,38,0.15)' : 'rgba(22,163,74,0.15)',
                                  color: selectedOrder.status === 'CANCELLED' ? theme.danger : theme.success
                                }}
                              >
                                {selectedOrder.status}
                              </span>
                            </td>
                          </tr>
                          <tr>
                            <td style={tdKeyStyle}>Created At</td>
                            <td style={tdValStyle}>{new Date(selectedOrder.createdAt).toLocaleString()}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* Bottom Table: Child Records */}
                    <div>
                      <h3 style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: theme.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Child Records (Order Line Items)
                      </h3>
                      <div style={{ overflowX: 'auto', borderRadius: 8, border: theme.border }}>
                        <table style={{ ...tableBorder, border: 'none', minWidth: '100%' }}>
                          <thead>
                            <tr>
                              <th style={thStyle}>SKU Code</th>
                              <th style={thStyle}>Quantity</th>
                              <th style={thStyle}>Unit Price</th>
                              <th style={thStyle}>Subtotal</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedOrder.lines.map((line, idx) => {
                              const unit = line.unitPriceCents / 100;
                              const subtotal = (line.unitPriceCents * line.quantity) / 100;
                              return (
                                <tr key={idx}>
                                  <td style={{ ...tdValStyle, fontWeight: 600, color: theme.primaryHi }}>{line.sku}</td>
                                  <td style={tdValStyle}>{line.quantity}</td>
                                  <td style={tdValStyle}>${unit.toFixed(2)}</td>
                                  <td style={tdValStyle}>${subtotal.toFixed(2)}</td>
                                </tr>
                              );
                            })}
                            {/* Grand Total Calculation Row */}
                            <tr style={{ background: theme.surface2 }}>
                              <td colSpan={3} style={{ ...tdValStyle, fontWeight: 700, textAlign: 'right' }}>
                                Grand Total:
                              </td>
                              <td style={{ ...tdValStyle, fontWeight: 700, color: theme.accent }}>
                                $
                                {(
                                  selectedOrder.lines.reduce(
                                    (sum, l) => sum + (l.unitPriceCents * l.quantity) / 100,
                                    0
                                  )
                                ).toFixed(2)}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {selectedOrder.status !== 'CANCELLED' && (
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8, gap: 8, alignItems: 'center' }}>
                        {confirmCancelId === selectedOrder.orderId && (
                          <span style={{ fontSize: 12, color: theme.danger, fontWeight: 600 }}>Are you sure?</span>
                        )}
                        {confirmCancelId === selectedOrder.orderId && (
                          <button
                            type="button"
                            disabled={busy}
                            style={{ ...btn('secondary'), fontSize: 12, padding: '4px 12px' }}
                            onClick={() => setConfirmCancelId(null)}
                          >
                            No, keep it
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={busy}
                          style={btn('danger')}
                          onClick={async () => {
                            if (confirmCancelId !== selectedOrder.orderId) {
                              setConfirmCancelId(selectedOrder.orderId);
                              return;
                            }
                            setConfirmCancelId(null);
                            setBusy(true);
                            try {
                              const r = await callSecureTool('order_cancel', { orderId: selectedOrder.orderId });
                              if (r && typeof r === 'object' && (r as any).ok) {
                                const updated: OrderRecord = { ...selectedOrder, status: 'CANCELLED' };
                                setSelectedOrder(updated);
                                setAllOrders((prev) =>
                                  prev.map((o) => (o.orderId === selectedOrder.orderId ? updated : o))
                                );
                              }
                              setCrudOut(r);
                            } catch (e) {
                              setCrudOut({ error: String(e) });
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          {confirmCancelId === selectedOrder.orderId ? '✅ Yes, Cancel Order' : '🚫 Cancel Order'}
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ padding: '40px 0', textAlign: 'center', color: theme.muted, fontSize: 13 }}>
                    Select an order from the list on the left to see its parent-child details hierarchy.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Create Order */}
        {mainTab === 'create_order' && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))',
              gap: 20,
              alignItems: 'start'
            }}
          >
            {/* Left Column: Visual Form Builder */}
            <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 18 }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: theme.text }}>🛒 Visual Order Builder</h2>
              <p style={{ margin: 0, fontSize: 13, color: theme.muted }}>
                Add products from the catalog to your shopping cart to draft and place transactions visually.
              </p>

              {/* Success Alert Block */}
              {crudOut &&
                typeof crudOut === 'object' &&
                (crudOut as any).ok &&
                currentAction === 'order_create' && (
                  <div
                    style={{
                      background: 'rgba(22,163,74,0.12)',
                      border: `1px solid ${theme.success}`,
                      borderRadius: theme.radius,
                      padding: 16,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10
                    }}
                  >
                    <div style={{ fontWeight: 700, color: theme.success, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>✓</span> Order Created Successfully!
                    </div>
                    <div style={{ fontSize: 12, color: theme.text }}>
                      <div>
                        <strong>Order ID:</strong>{' '}
                        <code style={{ color: theme.accent, fontFamily: 'monospace' }}>
                          {(crudOut as any).data?.orderId || '—'}
                        </code>
                      </div>
                      <div style={{ marginTop: 4 }}>
                        <strong>Customer Reference:</strong> {(crudOut as any).data?.customerRef || '—'}
                      </div>
                    </div>
                    <button
                      type="button"
                      style={btn('secondary')}
                      onClick={() => {
                        setMainTab('search_browse');
                        const created = (crudOut as any).data;
                        if (created) {
                          const record: OrderRecord = {
                            orderId: created.orderId,
                            customerRef: created.customerRef,
                            status: created.status || 'CONFIRMED',
                            lines: created.lines || [],
                            createdAt: created.createdAt || new Date().toISOString(),
                            updatedAt: created.updatedAt || new Date().toISOString()
                          };
                          setSelectedOrder(record);
                          setOrderId(record.orderId);
                        }
                      }}
                    >
                      🔎 Inspect Order in Search &amp; Browse
                    </button>
                  </div>
                )}

              {/* Customer ID field */}
              <div>
                <label style={labelStyle}>Customer Reference</label>
                <input
                  type="text"
                  value={customerRef}
                  onChange={(e) => setCustomerRef(e.target.value)}
                  placeholder="Enter customer identifier..."
                  style={inputStyle}
                />
              </div>

              {/* Catalog Item & Quantity Selector */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Select Product</label>
                  {allProducts.length === 0 ? (
                    <div style={{ ...inputStyle, background: theme.surface2, color: theme.muted, fontSize: 13 }}>
                      No cached catalog items.
                    </div>
                  ) : (
                    <select
                      value={cartSku}
                      onChange={(e) => setCartSku(e.target.value)}
                      style={inputStyle}
                    >
                      {allProducts.map((p) => (
                        <option key={p.productId} value={p.sku}>
                          {p.sku} — {p.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div>
                  <label style={labelStyle}>Quantity</label>
                  <input
                    type="number"
                    min={1}
                    value={cartQty}
                    onChange={(e) => setCartQty(Math.max(1, parseInt(e.target.value) || 1))}
                    style={inputStyle}
                  />
                </div>
              </div>

              <button
                type="button"
                disabled={allProducts.length === 0}
                style={btn('secondary')}
                onClick={handleAddToCart}
              >
                ＋ Add Line Item to Cart
              </button>

              {/* Cart Items Grid List */}
              <div>
                <label style={labelStyle}>Pending Order Cart Items</label>
                <div style={{ overflowX: 'auto', borderRadius: 8, border: theme.border }}>
                  <table style={{ ...tableBorder, border: 'none', minWidth: '100%' }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>SKU</th>
                        <th style={thStyle}>Name</th>
                        <th style={thStyle}>Qty</th>
                        <th style={thStyle}>Price</th>
                        <th style={thStyle}>Subtotal</th>
                        <th style={thStyle}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {visualCart.length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ ...tdValStyle, textAlign: 'center', color: theme.muted }}>
                            Your cart is empty. Choose products and add lines above.
                          </td>
                        </tr>
                      ) : (
                        visualCart.map((item, idx) => (
                          <tr key={idx}>
                            <td style={{ ...tdValStyle, fontWeight: 600, color: theme.primaryHi }}>{item.sku}</td>
                            <td style={tdValStyle}>{item.name}</td>
                            <td style={tdValStyle}>{item.quantity}</td>
                            <td style={tdValStyle}>${(item.unitPriceCents / 100).toFixed(2)}</td>
                            <td style={tdValStyle}>${((item.unitPriceCents * item.quantity) / 100).toFixed(2)}</td>
                            <td style={{ ...tdValStyle, textAlign: 'center' }}>
                              <button
                                type="button"
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: theme.danger,
                                  cursor: 'pointer',
                                  fontSize: 14,
                                  fontWeight: 800
                                }}
                                onClick={() => setVisualCart((prev) => prev.filter((_, i) => i !== idx))}
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                      {visualCart.length > 0 && (
                        <tr style={{ background: theme.surface2 }}>
                          <td colSpan={4} style={{ ...tdValStyle, fontWeight: 700, textAlign: 'right' }}>
                            Grand Total:
                          </td>
                          <td colSpan={2} style={{ ...tdValStyle, fontWeight: 700, color: theme.accent }}>
                            $
                            {(
                              visualCart.reduce((sum, item) => sum + (item.unitPriceCents * item.quantity) / 100, 0)
                            ).toFixed(2)}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="button"
                disabled={busy || !customerRef.trim() || visualCart.length === 0}
                style={btn('primary')}
                onClick={async () => {
                  setBusy(true);
                  setCurrentAction('order_create');
                  setCrudOut(null);
                  try {
                    const payload = {
                      customerRef,
                      lines: visualCart.map((c) => ({ sku: c.sku, quantity: c.quantity }))
                    };
                    const r = await callSecureTool('order_create', payload);
                    setCrudOut(r);
                    if (r && typeof r === 'object' && (r as any).ok) {
                      setVisualCart([]);
                      try {
                        const ords = await callSecureTool('order_list');
                        const data = (ords as any).data || (ords as any).structuredContent?.data || ords;
                        const orders = Array.isArray(data) ? data : (data && Array.isArray((data as any).orders) ? (data as any).orders : []);
                        setAllOrders(orders);
                      } catch {}
                    }
                  } catch (e) {
                    setCrudOut({ error: String(e) });
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                🚀 Place Secure AWS Order (order_create)
              </button>
            </div>

            {/* Right Column: Fields to be Inserted Panel */}
            <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: theme.text }}>
                📋 Fields to be Inserted
              </h2>
              <p style={{ margin: 0, fontSize: 13, color: theme.muted }}>
                Interactive payload schema view. Hover over the info badges for constraint and database guidelines.
              </p>

              {/* Schema Fields List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ background: theme.surface2, padding: 12, borderRadius: 8, border: theme.border }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: theme.text, fontFamily: 'monospace' }}>
                      customerRef
                    </span>
                    <span style={{ fontSize: 11, color: customerRef.trim() ? theme.success : theme.danger, fontWeight: 700 }}>
                      {customerRef.trim() ? '✓ Defined' : '✗ Required'}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: theme.muted }}>
                    Value: <code style={{ color: theme.accent }}>"{customerRef}"</code>
                    {infoBadge('customerRef', 'Unique reference ID for the client. Constraint: 1 to 128 characters.')}
                  </div>
                </div>

                <div style={{ background: theme.surface2, padding: 12, borderRadius: 8, border: theme.border }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: theme.text, fontFamily: 'monospace' }}>
                      lines
                    </span>
                    <span style={{ fontSize: 11, color: visualCart.length > 0 ? theme.success : theme.danger, fontWeight: 700 }}>
                      {visualCart.length > 0 ? `✓ ${visualCart.length} lines` : '✗ Empty'}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: theme.muted }}>
                    JSON array of transaction lines. Minimum 1 line required.
                    {infoBadge('lines', 'JSON array of transaction lines. Constraint: Minimum 1, maximum 50 lines.')}
                  </div>
                </div>

                {visualCart.length > 0 && (
                  <div style={{ background: theme.surface2, padding: 12, borderRadius: 8, border: theme.border, marginLeft: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: theme.muted, marginBottom: 8 }}>
                      Nested Line Item Fields:
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ borderBottom: `1px solid ${theme.border}`, paddingBottom: 6 }}>
                        <span style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 600, color: theme.text }}>
                          lines[i].sku
                        </span>
                        {infoBadge('lines[i].sku', 'Stock Keeping Unit. Must match a valid, existing product in the catalog.')}
                      </div>
                      <div>
                        <span style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 600, color: theme.text }}>
                          lines[i].quantity
                        </span>
                        {infoBadge('lines[i].quantity', 'Item count ordered. Constraint: Positive integer (>= 1).')}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Live JSON Payload Output */}
              <div style={{ marginTop: 12 }}>
                <h3 style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: theme.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Live JSON Payload
                </h3>
                <pre
                  style={{
                    margin: 0,
                    background: theme.inputBg,
                    color: theme.text,
                    padding: 12,
                    borderRadius: 8,
                    fontSize: 11,
                    fontFamily: 'monospace',
                    border: theme.border,
                    maxHeight: 220,
                    overflow: 'auto'
                  }}
                >
                  {JSON.stringify(
                    {
                      action: 'order_create',
                      customerRef,
                      lines: visualCart.map((c) => ({ sku: c.sku, quantity: c.quantity }))
                    },
                    null,
                    2
                  )}
                </pre>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Help / Manual */}
        {mainTab === 'help' && (
          <div style={{ ...cardStyle, maxWidth: 920, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 700, color: theme.text }}>Help &amp; System Manual</h2>
              <p style={{ ...helpPara, marginBottom: 12 }}>
                Reference for the <strong style={{ color: theme.text }}>NitroStack AWS Supply Chain</strong> module — aligned with the repository{' '}
                <code style={{ fontSize: 12, fontFamily: 'ui-monospace, monospace', color: theme.primaryHi }}>README.md</code>. Covers business context,
                solution architecture, tool stack, security, and operations (provision, cost, teardown).
              </p>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <button type="button" onClick={() => setHelpSubTab('business')} style={subTabStyle(helpSubTab === 'business')}>
                Significance
              </button>
              <button type="button" onClick={() => setHelpSubTab('architecture')} style={subTabStyle(helpSubTab === 'architecture')}>
                Architecture
              </button>
              <button type="button" onClick={() => setHelpSubTab('nitrostack')} style={subTabStyle(helpSubTab === 'nitrostack')}>
                Tool stack &amp; MCP
              </button>
              <button type="button" onClick={() => setHelpSubTab('security')} style={subTabStyle(helpSubTab === 'security')}>
                Security &amp; IAM
              </button>
              <button type="button" onClick={() => setHelpSubTab('guide')} style={subTabStyle(helpSubTab === 'guide')}>
                Operations guide
              </button>
            </div>

            <div
              style={{
                maxHeight: 'min(62vh, 600px)',
                overflowY: 'auto',
                border: theme.border,
                borderRadius: 8,
                padding: '16px 18px',
                background: theme.surface2
              }}
            >
              {helpSubTab === 'business' && (
                <div>
                  {helpHeading3('Significance')}
                  <p style={helpPara}>
                    This module is a standalone MCP reference for <strong style={{ color: theme.text }}>supply chain and order fulfilment</strong> on AWS:
                    catalog, stock reservation, and order orchestration behind one <strong style={{ color: theme.text }}>HTTP API</strong> with{' '}
                    <strong style={{ color: theme.text }}>Cognito</strong> authentication — no mock APIs on the happy path.
                  </p>
                  <p style={helpPara}>
                    <strong style={{ color: theme.text }}>NitroStack Studio</strong> (tools + widgets), agents, and the <strong style={{ color: theme.text }}>web portal</strong> share the
                    same JWT-authorized contract. Terraform provisions API Gateway, Lambdas, DynamoDB, Cognito, and Secrets Manager; configuration is resolved at runtime via IAM.
                  </p>
                  {helpHeading4('Pain points addressed')}
                  <ul style={{ ...helpPara, paddingLeft: 20 }}>
                    <li style={{ marginBottom: 6 }}>
                      <strong style={{ color: theme.text }}>Disjoint channels</strong> — catalog, inventory, and orders consolidated behind one HTTP API and MCP tool surface.
                    </li>
                    <li style={{ marginBottom: 6 }}>
                      <strong style={{ color: theme.text }}>Configuration drift</strong> — Terraform publishes a unified app secret; local MCP reads it via GetSecretValue.
                    </li>
                    <li style={{ marginBottom: 6 }}>
                      <strong style={{ color: theme.text }}>Fragile demos</strong> — failures surface as structured JSON and CloudWatch logs, like production.
                    </li>
                  </ul>
                  {helpHeading4('Benefits')}
                  <ul style={{ ...helpPara, paddingLeft: 20 }}>
                    <li style={{ marginBottom: 6 }}>
                      <strong style={{ color: theme.text }}>Bounded contexts</strong> — <code>catalog</code>, <code>inventory</code>, <code>orders</code> as Lambdas; orders invokes peers; inventory is not on HTTP.
                    </li>
                    <li style={{ marginBottom: 6 }}>
                      <strong style={{ color: theme.text }}>Predictable security</strong> — Cognito JWT authorizer, resource-server scopes, Secrets Manager for MCP credentials.
                    </li>
                    <li style={{ marginBottom: 6 }}>
                      <strong style={{ color: theme.text }}>Repeatable environments</strong> — <code>npm run provision:aws</code> builds, applies Terraform, writes <code>.generated/.env</code>.
                    </li>
                  </ul>
                  {helpHeading4('Target audience')}
                  <p style={helpPara}>
                    Teams evaluating NitroStack industry MCP servers; platform engineers wanting Terraform-first HTTP API + Lambda + DynamoDB + Cognito; architects comparing{' '}
                    <strong style={{ color: theme.text }}>human (PKCE)</strong> vs <strong style={{ color: theme.text }}>machine (client credentials)</strong> on one API.
                  </p>
                </div>
              )}

              {helpSubTab === 'architecture' && (
                <div>
                  {helpHeading3('Solution architecture')}
                  <p style={helpPara}>
                    End-to-end path: <strong style={{ color: theme.text }}>Studio / web portal</strong> → <strong style={{ color: theme.text }}>MCP or browser</strong> →{' '}
                    <strong style={{ color: theme.text }}>API Gateway (HTTP)</strong> → <strong style={{ color: theme.text }}>Lambda</strong> (bounded contexts) →{' '}
                    <strong style={{ color: theme.text }}>DynamoDB</strong>. See <code>docs/architecture.svg</code> in the repo (animated in a browser; static on GitHub README).
                  </p>
                  {helpHeading4('HTTP routes (JWT authorizer)')}
                  <ul style={{ ...helpPara, paddingLeft: 20, fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>
                    <li style={{ marginBottom: 4 }}>GET /v1/catalog/products → catalog (list, limit 100)</li>
                    <li style={{ marginBottom: 4 }}>GET /v1/catalog/products/{'{productId}'} → catalog (SKU-validated)</li>
                    <li style={{ marginBottom: 4 }}>POST /v1/orders → orders (catalog lookup + inventory reserve per line)</li>
                    <li style={{ marginBottom: 4 }}>GET /v1/orders → orders (GSI1 list)</li>
                    <li style={{ marginBottom: 4 }}>GET /v1/orders/{'{orderId}'} → orders</li>
                    <li style={{ marginBottom: 4 }}>POST /v1/orders/{'{orderId}'}/cancel → orders (CONFIRMED only; releases stock)</li>
                  </ul>
                  <p style={{ ...helpPara, fontSize: 12 }}>
                    <strong style={{ color: theme.text }}>No HTTP route to inventory</strong> — reserve/release are synchronous Lambda invokes from orders only.
                  </p>
                  {helpHeading4('Request paths')}
                  <ul style={{ ...helpPara, paddingLeft: 20 }}>
                    <li style={{ marginBottom: 6 }}>
                      <strong style={{ color: theme.text }}>Operator path</strong> — Studio → MCP (<code>supply_chain</code> tool, client credentials) → API Gateway → catalog or orders → DynamoDB. Orders invokes catalog (<code>getBySku</code>) and inventory (<code>reserve</code> / <code>release</code>).
                    </li>
                    <li style={{ marginBottom: 6 }}>
                      <strong style={{ color: theme.text }}>Human path</strong> — web-portal → OIDC + PKCE → same routes with a user access token.
                    </li>
                    <li style={{ marginBottom: 6 }}>
                      <strong style={{ color: theme.text }}>Provision path</strong> — <code>npm run provision:aws</code> → Lambda build → Terraform apply → optional <code>npm run seed</code>.
                    </li>
                  </ul>
                  {helpHeading4('Happy path (create order)')}
                  <p style={helpPara}>
                    Create order → catalog lookup per line → inventory reserve → persist order → JSON response. Cancel on a CONFIRMED order invokes inventory release.
                  </p>
                  {helpHeading4('DynamoDB tables')}
                  <ul style={{ ...helpPara, paddingLeft: 20 }}>
                    <li style={{ marginBottom: 4 }}><strong style={{ color: theme.text }}>Products</strong> — SKU rows (catalog read)</li>
                    <li style={{ marginBottom: 4 }}><strong style={{ color: theme.text }}>Orders</strong> — order records + GSI for listing</li>
                    <li style={{ marginBottom: 4 }}><strong style={{ color: theme.text }}>Inventory</strong> — stock per SKU (inventory write; orders orchestrates)</li>
                  </ul>
                </div>
              )}

              {helpSubTab === 'nitrostack' && (
                <div>
                  {helpHeading3('Tool stack')}
                  <ul style={{ ...helpPara, paddingLeft: 20 }}>
                    <li style={{ marginBottom: 4 }}>MCP / DI — NitroStack (<code>@nitrostack/core</code>, CLI)</li>
                    <li style={{ marginBottom: 4 }}>Studio UI — Next.js widgets, <code>@nitrostack/widgets</code></li>
                    <li style={{ marginBottom: 4 }}>HTTP API — API Gateway HTTP API + Cognito JWT authorizer</li>
                    <li style={{ marginBottom: 4 }}>Auth — Cognito: web PKCE, MCP client credentials, resource-server scopes</li>
                    <li style={{ marginBottom: 4 }}>Compute — Lambda Node.js 20, X-Ray</li>
                    <li style={{ marginBottom: 4 }}>Data — DynamoDB (products, inventory, orders + GSI)</li>
                    <li style={{ marginBottom: 4 }}>Secrets — Secrets Manager JSON from Terraform</li>
                    <li style={{ marginBottom: 4 }}>IaC — Terraform ≥ 1.5</li>
                    <li style={{ marginBottom: 4 }}>Browser — Vite + React, oidc-client-ts</li>
                    <li style={{ marginBottom: 4 }}>Validation — Zod (<code>packages/contracts</code>), <code>services/common/</code></li>
                  </ul>
                  {helpHeading4('MCP surfaces')}
                  <ul style={{ ...helpPara, paddingLeft: 20 }}>
                    <li style={{ marginBottom: 6 }}>
                      <code style={{ fontSize: 12, fontFamily: 'ui-monospace, monospace', color: theme.primaryHi }}>supply_chain</code> —{' '}
                      <code>catalog_list</code>, <code>catalog_get</code>, <code>order_create</code>, <code>order_list</code>, <code>order_get</code>, <code>order_cancel</code>, <code>get_public_config</code>. <code>@RateLimit</code> 120/min.
                    </li>
                    <li style={{ marginBottom: 6 }}>
                      <code style={{ fontSize: 12, fontFamily: 'ui-monospace, monospace', color: theme.primaryHi }}>@Resource</code> — <code>supply-chain://bounded-contexts</code>
                    </li>
                    <li style={{ marginBottom: 6 }}>
                      <code style={{ fontSize: 12, fontFamily: 'ui-monospace, monospace', color: theme.primaryHi }}>@Widget</code> — this studio (<code>supply-chain-studio</code>)
                    </li>
                    <li style={{ marginBottom: 6 }}>
                      <code style={{ fontSize: 12, fontFamily: 'ui-monospace, monospace', color: theme.primaryHi }}>@HealthCheck</code> — process + AWS STS connectivity
                    </li>
                    <li style={{ marginBottom: 6 }}>
                      <code style={{ fontSize: 12, fontFamily: 'ui-monospace, monospace', color: theme.primaryHi }}>useWidgetSDK</code> — <code>sdk.callTool('supply_chain', payload)</code> from the widget
                    </li>
                  </ul>
                  {helpHeading4('Repo layout')}
                  <p style={{ ...helpPara, fontFamily: 'ui-monospace, monospace', fontSize: 11, lineHeight: 1.6 }}>
                    packages/contracts · services/common · services/catalog|inventory|orders · mcp-server · web-portal · infrastructure/terraform · scripts · docs
                  </p>
                </div>
              )}

              {helpSubTab === 'security' && (
                <div>
                  {helpHeading3('AWS deployment, security & operations')}
                  <ul style={{ ...helpPara, paddingLeft: 20 }}>
                    <li style={{ marginBottom: 6 }}>
                      <strong style={{ color: theme.text }}>Least privilege</strong> — catalog reads products; inventory mutates inventory only; orders reads/writes orders + GSI and invokes catalog/inventory.
                    </li>
                    <li style={{ marginBottom: 6 }}>
                      <strong style={{ color: theme.text }}>Secrets</strong> — MCP credentials and URLs in Secrets Manager, not in git. Portal bundle has no secret values.
                    </li>
                    <li style={{ marginBottom: 6 }}>
                      <strong style={{ color: theme.text }}>Terraform state</strong> — gitignored; use remote encrypted backend for teams.
                    </li>
                    <li style={{ marginBottom: 6 }}>
                      <strong style={{ color: theme.text }}>Operator IAM</strong> — <code>terraform output -raw nitrostack_mcp_operator_policy_json</code> after deploy.
                    </li>
                  </ul>
                  {helpHeading4('Human auth (web portal)')}
                  <p style={helpPara}>
                    Cognito hosted UI → OIDC authorization code + <strong style={{ color: theme.text }}>PKCE</strong> → user access token → <code>Authorization: Bearer</code> on API Gateway. JWT validated against Cognito JWKS.
                  </p>
                  {helpHeading4('Machine auth (this MCP)')}
                  <p style={helpPara}>
                    MCP loads region and app secret name from <code>.env</code> / <code>.generated/.env</code>, reads JSON from <strong style={{ color: theme.text }}>Secrets Manager</strong> via IAM, exchanges{' '}
                    <strong style={{ color: theme.text }}>client credentials</strong> for an access token, calls API Gateway with Bearer JWT and resource-server scopes.
                  </p>
                  {helpHeading4('Observability')}
                  <ul style={{ ...helpPara, paddingLeft: 20 }}>
                    <li style={{ marginBottom: 4 }}>CloudWatch Logs — structured JSON from Lambdas</li>
                    <li style={{ marginBottom: 4 }}><code>x-correlation-id</code> — API responses and MCP HTTP calls</li>
                    <li style={{ marginBottom: 4 }}>X-Ray — enabled on Lambdas in Terraform</li>
                  </ul>
                  <p style={helpPara}>
                    See <code>SECURITY.md</code> and <code>docs/DEPLOY_AND_DEVELOP.md</code> in the repo for credential handling.
                  </p>
                </div>
              )}

              {helpSubTab === 'guide' && (
                <div>
                  {helpHeading3('Studio widget — CRUD operations')}
                  {helpHeading4('Catalog')}
                  <ul style={{ ...helpPara, paddingLeft: 20 }}>
                    <li style={{ marginBottom: 4 }}><strong style={{ color: theme.text }}>List All Products</strong> — verifies API connectivity; product IDs are SKUs (e.g. <code>SKU-001</code>).</li>
                    <li style={{ marginBottom: 4 }}><strong style={{ color: theme.text }}>Get Details</strong> — enter a SKU, not a UUID.</li>
                  </ul>
                  {helpHeading4('Orders')}
                  <ul style={{ ...helpPara, paddingLeft: 20 }}>
                    <li style={{ marginBottom: 4 }}><strong style={{ color: theme.text }}>List All Orders</strong> — historical orders from DynamoDB.</li>
                    <li style={{ marginBottom: 4 }}><strong style={{ color: theme.text }}>Create Order</strong> — customer ID + lines JSON; reserves stock per line.</li>
                    <li style={{ marginBottom: 4 }}><strong style={{ color: theme.text }}>Get / Cancel</strong> — order ID (UUID); cancel only for CONFIRMED orders.</li>
                  </ul>

                  {helpHeading3('Provision & deploy (from repo root)')}
                  <p style={{ ...helpPara, fontFamily: 'ui-monospace, monospace', fontSize: 11, lineHeight: 1.65 }}>
                    npm install<br />
                    export AWS_REGION=us-east-2<br />
                    export TF_AUTO_APPROVE=1<br />
                    export RUN_SEED=1<br />
                    npm run provision:aws<br />
                    npm run dev&nbsp;&nbsp;# attach Studio to mcp-server/<br />
                    cd web-portal &amp;&amp; npm run dev&nbsp;&nbsp;# human PKCE path
                  </p>

                  {helpHeading4('AWS cost notice (PoC)')}
                  <p style={helpPara}>
                    Deploying creates <strong style={{ color: theme.text }}>real billable resources</strong>. Rough order of magnitude in <code>us-east-2</code> with light testing: about{' '}
                    <strong style={{ color: theme.text }}>$5–25/month</strong> idle/light use; higher with 24/7 traffic. Destroy the stack when finished.
                  </p>

                  {helpHeading4('Rollback / teardown')}
                  <p style={{ ...helpPara, fontFamily: 'ui-monospace, monospace', fontSize: 11, lineHeight: 1.65 }}>
                    export AWS_REGION=us-east-2<br />
                    export TF_AUTO_APPROVE=1<br />
                    npm run destroy:aws
                  </p>
                  <p style={helpPara}>
                    Removes Terraform-managed resources and <code>.generated/.env</code>. MCP and portal calls fail until you provision again. See <code>docs/DEPLOYMENT_RUNBOOK.md</code> for runbook detail.
                  </p>

                  {helpHeading4('Further reading')}
                  <ul style={{ ...helpPara, paddingLeft: 20 }}>
                    <li style={{ marginBottom: 4 }}>README.md — module overview</li>
                    <li style={{ marginBottom: 4 }}>docs/architecture.svg — solution diagram</li>
                    <li style={{ marginBottom: 4 }}>docs/DEPLOY_AND_DEVELOP.md · docs/DEPLOYMENT_RUNBOOK.md</li>
                    <li style={{ marginBottom: 4 }}>infrastructure/terraform/README.md</li>
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SupplyChainStudioPage() {
  return (
    <ErrorBoundary>
      <SupplyChainStudioPageContent />
    </ErrorBoundary>
  );
}
