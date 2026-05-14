/**
 * @file supply-chain-api.service.ts
 * @summary HTTP client to the supply-chain API Gateway (Bearer token from Cognito M2M).
 * @context Invoked by MCP tools; failures log to stderr and `supply-chain/.supply-chain-runtime.log`.
 * @debugging Use `correlationId` in logs and in thrown messages to match API `x-correlation-id` / CloudWatch.
 */

import { CognitoM2mTokenService } from './cognito-m2m-token.service.js';
import { SupplyChainAppConfigService } from './supply-chain-app-config.service.js';
import { appendRuntimeLog } from './runtime-file-logger.js';
import { Injectable } from '@nitrostack/core';

function logApiError(correlationId: string, where: string, status: number, body: string) {
  const payload = {
    level: 'ERROR' as const,
    correlationId,
    where,
    status,
    body: body.length > 8000 ? `${body.slice(0, 8000)}…` : body
  };
  process.stderr.write(JSON.stringify(payload) + '\n');
  appendRuntimeLog(payload);
}

function parseResponseBody(correlationId: string, where: string, text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (e) {
    logApiError(correlationId, `${where}.json`, 0, text.slice(0, 2000));
    appendRuntimeLog({
      level: 'ERROR',
      correlationId,
      where: `${where}.json`,
      message: e instanceof Error ? e.message : String(e)
    });
    throw new Error(
      `The service returned data we could not read as JSON. Try again or contact support with reference: ${correlationId}`
    );
  }
}

@Injectable({ deps: [CognitoM2mTokenService, SupplyChainAppConfigService] })
export class SupplyChainApiService {
  constructor(
    private readonly tokens: CognitoM2mTokenService,
    private readonly appConfig: SupplyChainAppConfigService
  ) {}

  private async baseUrl(): Promise<string> {
    const c = await this.appConfig.get();
    return c.httpApiBaseUrl.replace(/\/$/, '');
  }

  private async authHeaders(correlationId: string) {
    const token = await this.tokens.getAccessToken(correlationId);
    return {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'x-correlation-id': correlationId
    } as const;
  }

  async listProducts(correlationId: string) {
    try {
      const baseUrl = await this.baseUrl();
      const res = await fetch(`${baseUrl}/v1/catalog/products`, {
        headers: await this.authHeaders(correlationId)
      });
      const text = await res.text();
      if (!res.ok) {
        logApiError(correlationId, 'SupplyChainApiService.listProducts', res.status, text);
        throw new Error(
          `The catalog could not be loaded (${res.status}). Reference: ${correlationId}`
        );
      }
      return parseResponseBody(correlationId, 'SupplyChainApiService.listProducts', text);
    } catch (err) {
      if (err instanceof Error && err.message.includes('Reference:')) throw err;
      appendRuntimeLog({
        level: 'ERROR',
        correlationId,
        where: 'SupplyChainApiService.listProducts',
        message: err instanceof Error ? err.message : String(err)
      });
      throw new Error(`Network or configuration error while loading catalog. Reference: ${correlationId}`);
    }
  }

  async getProduct(correlationId: string, productId: string) {
    try {
      const baseUrl = await this.baseUrl();
      const res = await fetch(`${baseUrl}/v1/catalog/products/${encodeURIComponent(productId)}`, {
        headers: await this.authHeaders(correlationId)
      });
      const text = await res.text();
      if (!res.ok) {
        logApiError(correlationId, 'SupplyChainApiService.getProduct', res.status, text);
        throw new Error(`The product could not be retrieved (${res.status}). Reference: ${correlationId}`);
      }
      return parseResponseBody(correlationId, 'SupplyChainApiService.getProduct', text);
    } catch (err) {
      if (err instanceof Error && err.message.includes('Reference:')) throw err;
      appendRuntimeLog({
        level: 'ERROR',
        correlationId,
        where: 'SupplyChainApiService.getProduct',
        message: err instanceof Error ? err.message : String(err)
      });
      throw new Error(`Could not load product details. Reference: ${correlationId}`);
    }
  }

  async createOrder(
    correlationId: string,
    body: { customerRef: string; lines: Array<{ sku: string; quantity: number }> }
  ) {
    try {
      const baseUrl = await this.baseUrl();
      const res = await fetch(`${baseUrl}/v1/orders`, {
        method: 'POST',
        headers: await this.authHeaders(correlationId),
        body: JSON.stringify(body)
      });
      const text = await res.text();
      if (!res.ok) {
        logApiError(correlationId, 'SupplyChainApiService.createOrder', res.status, text);
        throw new Error(`The order could not be created (${res.status}). Reference: ${correlationId}`);
      }
      return parseResponseBody(correlationId, 'SupplyChainApiService.createOrder', text);
    } catch (err) {
      if (err instanceof Error && err.message.includes('Reference:')) throw err;
      appendRuntimeLog({
        level: 'ERROR',
        correlationId,
        where: 'SupplyChainApiService.createOrder',
        message: err instanceof Error ? err.message : String(err)
      });
      throw new Error(`Could not create the order. Reference: ${correlationId}`);
    }
  }

  async listOrders(correlationId: string) {
    try {
      const baseUrl = await this.baseUrl();
      const res = await fetch(`${baseUrl}/v1/orders`, {
        headers: await this.authHeaders(correlationId)
      });
      const text = await res.text();
      if (!res.ok) {
        logApiError(correlationId, 'SupplyChainApiService.listOrders', res.status, text);
        throw new Error(`Orders could not be listed (${res.status}). Reference: ${correlationId}`);
      }
      return parseResponseBody(correlationId, 'SupplyChainApiService.listOrders', text);
    } catch (err) {
      if (err instanceof Error && err.message.includes('Reference:')) throw err;
      appendRuntimeLog({
        level: 'ERROR',
        correlationId,
        where: 'SupplyChainApiService.listOrders',
        message: err instanceof Error ? err.message : String(err)
      });
      throw new Error(`Could not load orders. Reference: ${correlationId}`);
    }
  }

  async getOrder(correlationId: string, orderId: string) {
    try {
      const baseUrl = await this.baseUrl();
      const res = await fetch(`${baseUrl}/v1/orders/${encodeURIComponent(orderId)}`, {
        headers: await this.authHeaders(correlationId)
      });
      const text = await res.text();
      if (!res.ok) {
        logApiError(correlationId, 'SupplyChainApiService.getOrder', res.status, text);
        throw new Error(`The order could not be retrieved (${res.status}). Reference: ${correlationId}`);
      }
      return parseResponseBody(correlationId, 'SupplyChainApiService.getOrder', text);
    } catch (err) {
      if (err instanceof Error && err.message.includes('Reference:')) throw err;
      appendRuntimeLog({
        level: 'ERROR',
        correlationId,
        where: 'SupplyChainApiService.getOrder',
        message: err instanceof Error ? err.message : String(err)
      });
      throw new Error(`Could not load order details. Reference: ${correlationId}`);
    }
  }

  async cancelOrder(correlationId: string, orderId: string) {
    try {
      const baseUrl = await this.baseUrl();
      const res = await fetch(`${baseUrl}/v1/orders/${encodeURIComponent(orderId)}/cancel`, {
        method: 'POST',
        headers: await this.authHeaders(correlationId)
      });
      const text = await res.text();
      if (!res.ok) {
        logApiError(correlationId, 'SupplyChainApiService.cancelOrder', res.status, text);
        throw new Error(`The order could not be cancelled (${res.status}). Reference: ${correlationId}`);
      }
      return parseResponseBody(correlationId, 'SupplyChainApiService.cancelOrder', text);
    } catch (err) {
      if (err instanceof Error && err.message.includes('Reference:')) throw err;
      appendRuntimeLog({
        level: 'ERROR',
        correlationId,
        where: 'SupplyChainApiService.cancelOrder',
        message: err instanceof Error ? err.message : String(err)
      });
      throw new Error(`Could not cancel the order. Reference: ${correlationId}`);
    }
  }
}
