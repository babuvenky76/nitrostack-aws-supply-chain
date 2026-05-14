/**
 * @file cognito-m2m-token.service.ts
 * @summary OAuth2 client-credentials token for the MCP machine client (Cognito).
 * @context Token URL and secrets come from {@link SupplyChainAppConfigService} / Secrets Manager.
 * @debugging Token failures log to stderr and `.supply-chain-runtime.log` with `correlationId` (no secrets in messages).
 */

import { appendRuntimeLog } from './runtime-file-logger.js';
import { Injectable } from '@nitrostack/core';
import { SupplyChainAppConfigService } from './supply-chain-app-config.service.js';

@Injectable({ deps: [SupplyChainAppConfigService] })
export class CognitoM2mTokenService {
  private cache: { accessToken: string; expiresAtMs: number } | null = null;

  constructor(private readonly appConfig: SupplyChainAppConfigService) {}

  async getAccessToken(correlationId: string): Promise<string> {
    const now = Date.now();
    if (this.cache && this.cache.expiresAtMs - 30_000 > now) {
      return this.cache.accessToken;
    }

    try {
      const cfg = await this.appConfig.get();
      const scope = await this.appConfig.oauthScope();
      const body = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: cfg.mcpClientId,
        client_secret: cfg.mcpClientSecret,
        scope
      });
      const res = await fetch(cfg.cognitoTokenUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-correlation-id': correlationId },
        body
      });
      const text = await res.text();
      if (!res.ok) {
        const payload = {
          level: 'ERROR' as const,
          correlationId,
          where: 'CognitoM2mTokenService.getAccessToken',
          status: res.status,
          body: text.slice(0, 2000)
        };
        process.stderr.write(JSON.stringify(payload) + '\n');
        appendRuntimeLog(payload);
        throw new Error(
          `Authentication service declined the request (${res.status}). Reference: ${correlationId}`
        );
      }
      let json: { access_token?: string; expires_in?: number };
      try {
        json = JSON.parse(text) as { access_token?: string; expires_in?: number };
      } catch (e) {
        appendRuntimeLog({
          level: 'ERROR',
          correlationId,
          where: 'CognitoM2mTokenService.parse',
          message: e instanceof Error ? e.message : String(e)
        });
        throw new Error(`Invalid token response from authentication service. Reference: ${correlationId}`);
      }
      if (!json.access_token || typeof json.expires_in !== 'number') {
        throw new Error(`Token response was incomplete. Reference: ${correlationId}`);
      }
      this.cache = {
        accessToken: json.access_token,
        expiresAtMs: now + json.expires_in * 1000
      };
      return json.access_token;
    } catch (err) {
      if (err instanceof Error && err.message.includes('Reference:')) throw err;
      appendRuntimeLog({
        level: 'ERROR',
        correlationId,
        where: 'CognitoM2mTokenService.getAccessToken',
        message: err instanceof Error ? err.message : String(err)
      });
      throw new Error(`Could not obtain an access token. Reference: ${correlationId}`);
    }
  }
}
