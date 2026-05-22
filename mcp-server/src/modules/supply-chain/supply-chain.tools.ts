/**
 * @file supply-chain.tools.ts
 * @summary MCP `@Tool` + `@Widget` — dispatches actions to {@link SupplyChainApiService} (real AWS HTTP API).
 * @context Rate-limited; errors return a friendly `userMessage` and log to `.supply-chain-runtime.log`.
 */

import {
  ToolDecorator as Tool,
  Widget,
  ExecutionContext,
  Injectable,
  z,
  RateLimit
} from '@nitrostack/core';
import { SupplyChainApiService } from '../../common/supply-chain-api.service.js';
import { SupplyChainAppConfigService } from '../../common/supply-chain-app-config.service.js';
import { appendRuntimeLog } from '../../common/runtime-file-logger.js';
import { randomUUID } from 'node:crypto';

const actions = [
  'catalog_list',
  'catalog_get',
  'order_create',
  'order_list',
  'order_get',
  'order_cancel',
  'get_public_config'
] as const;

type Action = (typeof actions)[number];

function isAction(s: unknown): s is Action {
  return typeof s === 'string' && (actions as readonly string[]).includes(s);
}

const inputSchema = z.object({}).passthrough();

@Injectable({ deps: [SupplyChainApiService, SupplyChainAppConfigService] })
export class SupplyChainTools {
  constructor(
    private readonly api: SupplyChainApiService,
    private readonly appConfig: SupplyChainAppConfigService
  ) {
    process.stderr.write('📦 Supply chain tools initialized (AWS HTTP API + Cognito browser login support)\n');
  }

  @Tool({
    name: 'supply_chain',
    title: '📦 Supply Chain',
    description:
      'Real AWS integration: API Gateway + Cognito + Lambda + DynamoDB. Manage catalog products and orders. Use the Studio widget for all inputs.',
    inputSchema
  })
  @Widget('supply-chain-studio')
  @RateLimit({ requests: 120, window: '1m' })
  async run(input: Record<string, any>, _ctx: ExecutionContext) {
    const correlationId = randomUUID();
    const action = input.action;
    if (!isAction(action)) {
      if (Object.keys(input).length === 0) {
        return {
          ok: true,
          hint: 'Open the Supply Chain control plane widget — use the top tabs (CRUD Operations, Help).'
        };
      }
      return { ok: false, correlationId, error: 'ACTION_REQUIRED', hint: actions };
    }
    try {
      const userToken = input.userToken;

      if (action === 'get_public_config') {
        let authority = process.env.VITE_COGNITO_AUTHORITY || '';
        let match = authority.match(/cognito-idp\.([^.]+)\.amazonaws\.com\/(.+)$/);
        let region = match ? match[1] : (process.env.AWS_REGION || 'us-east-2');
        let userPoolId = match ? match[2] : '';
        let clientId = process.env.VITE_COGNITO_WEB_CLIENT_ID || '';
        let apiUrl = process.env.VITE_AWS_HTTP_API_BASE_URL || '';

        try {
          const c = await this.appConfig.get();
          if (c.httpApiBaseUrl) apiUrl = c.httpApiBaseUrl;
          if (c.webClientId) clientId = c.webClientId;
          if (c.cognitoIssuer) {
            const m = c.cognitoIssuer.match(/cognito-idp\.([^.]+)\.amazonaws\.com\/(.+)$/);
            if (m) {
              region = m[1];
              userPoolId = m[2];
            }
          }
        } catch (err) {
          // Keep environment variable fallbacks
        }

        // Validate Cognito & API configurations without any disk .env scraping fallback
        if (!clientId || !userPoolId || !apiUrl || !region) {
          const missing = [];
          if (!clientId) missing.push('clientId/VITE_COGNITO_WEB_CLIENT_ID');
          if (!userPoolId) missing.push('userPoolId (from VITE_COGNITO_AUTHORITY/cognitoIssuer)');
          if (!apiUrl) missing.push('apiUrl/VITE_AWS_HTTP_API_BASE_URL');
          if (!region) missing.push('region/AWS_REGION');

          // Sanitize environment keys - show only which keys exist, never their values
          const debugEnvKeys = Object.keys(process.env)
            .filter(key => key.includes('COGNITO') || key.includes('AWS') || key.includes('VITE') || key.includes('SECRET'))
            .filter(key => !key.includes('CREDENTIAL') && !key.includes('TOKEN') && !key.includes('PASSWORD'))
            .map(key => `${key}=***`); // Show key name with masked value

          const errPayload = {
            level: 'ERROR' as const,
            correlationId,
            where: 'SupplyChainTools.run[get_public_config]',
            action,
            message: `OIDC/Cognito configuration missing: ${missing.join(', ')}`,
            missingParameters: missing,
            environmentKeysPresent: debugEnvKeys, // Keys only, never values
            cwd: process.cwd(),
            resolvedSecretsManagerArn: '***', // Masked for security
            resolvedSecretsManagerName: process.env.SUPPLY_CHAIN_APP_SECRET_NAME || 'not-set',
            stack: new Error().stack
          };

          try {
            process.stderr.write(JSON.stringify(errPayload) + '\n');
          } catch (_) {}
          appendRuntimeLog(errPayload);

          throw new Error(
            `Reference: OIDC/Cognito Configuration is missing. Missing fields: [${missing.join(', ')}]. Please check your .env file or Secrets Manager setup.`
          );
        }

        return {
          ok: true,
          correlationId,
          data: {
            userPoolId,
            clientId,
            region,
            apiUrl
          }
        };
      }

      if (action === 'catalog_list') {
        const data = await this.api.listProducts(correlationId, userToken);
        return { ok: true, correlationId, data };
      }
      if (action === 'catalog_get') {
        const productId = input.productId;
        if (!productId) return { ok: false, correlationId, error: 'productId required' };
        const data = await this.api.getProduct(correlationId, productId, userToken);
        return { ok: true, correlationId, data };
      }
      if (action === 'order_list') {
        const data = await this.api.listOrders(correlationId, userToken);
        return { ok: true, correlationId, data };
      }
      if (action === 'order_get') {
        const orderId = input.orderId;
        if (!orderId) return { ok: false, correlationId, error: 'orderId required' };
        const data = await this.api.getOrder(correlationId, orderId, userToken);
        return { ok: true, correlationId, data };
      }
      if (action === 'order_cancel') {
        const orderId = input.orderId;
        if (!orderId) return { ok: false, correlationId, error: 'orderId required' };
        const data = await this.api.cancelOrder(correlationId, orderId, userToken);
        return { ok: true, correlationId, data };
      }
      if (action === 'order_create') {
        const customerRef = input.customerRef;
        const lines = input.lines;
        if (!customerRef || !lines?.length) {
          return { ok: false, correlationId, error: 'customerRef and lines[] required for order_create' };
        }
        const data = await this.api.createOrder(correlationId, { customerRef, lines }, userToken);
        return { ok: true, correlationId, data };
      }
      return { ok: false, correlationId, error: 'UNREACHABLE' };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      const payload = {
        level: 'ERROR' as const,
        correlationId,
        where: 'SupplyChainTools.run',
        action,
        message,
        stack
      };
      try {
        process.stderr.write(JSON.stringify(payload) + '\n');
      } catch (_) {}
      appendRuntimeLog(payload);
      const userMessage =
        message.includes('Reference:') || message.includes('authentication')
          ? message
          : `The supply-chain action could not be completed. Use correlation id ${correlationId} with your administrator.`;
      return { ok: false, correlationId, error: userMessage };
    }
  }
}
