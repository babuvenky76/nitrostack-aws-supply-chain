/**
 * @file supply-chain-app-config.service.ts
 * @summary Loads and caches unified app configuration from AWS Secrets Manager (Terraform-managed JSON).
 * @context Used by Cognito M2M and HTTP API client; secret id from env / `.generated/.env` / default name.
 * @debugging On failure check IAM `secretsmanager:GetSecretValue` and secret JSON shape vs Zod schema.
 */

import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { Injectable } from '@nitrostack/core';
import { z } from 'zod';
import { appendRuntimeLog } from './runtime-file-logger.js';

const appSecretSchema = z.object({
  httpApiBaseUrl: z.string().min(1),
  cognitoTokenUrl: z.string().min(1),
  cognitoIssuer: z.string().min(1).optional(),
  webClientId: z.string().min(1).optional(),
  mcpClientId: z.string().min(1),
  mcpClientSecret: z.string().min(1),
  cognitoOAuthScope: z.string().min(1).optional(),
  productsTableName: z.string().min(1).optional(),
  inventoryTableName: z.string().min(1).optional(),
  ordersTableName: z.string().min(1).optional()
});

export type SupplyChainAppSecret = z.infer<typeof appSecretSchema>;

const legacyMcpOnly = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1)
});

@Injectable({ deps: [] })
export class SupplyChainAppConfigService {
  private cache: SupplyChainAppSecret | null = null;

  /** Secrets Manager SecretId: full ARN, friendly name, or legacy narrow secret ARN. */
  private resolveSecretId(): string {
    const arn = process.env.SUPPLY_CHAIN_APP_SECRET_ARN?.trim();
    if (arn) return arn;
    const name = process.env.SUPPLY_CHAIN_APP_SECRET_NAME?.trim();
    if (name) return name;
    const legacy = process.env.COGNITO_MCP_CREDENTIALS_SECRET_ARN?.trim();
    if (legacy) return legacy;
    const project = process.env.SUPPLY_CHAIN_PROJECT_NAME?.trim() || 'nsupply';
    return `${project}/nitrostack-app`;
  }

  async get(): Promise<SupplyChainAppSecret> {
    if (this.cache) return this.cache;

    try {
      const sm = new SecretsManagerClient({});
      const out = await sm.send(new GetSecretValueCommand({ SecretId: this.resolveSecretId() }));
      const raw = out.SecretString;
      if (!raw) {
        throw new Error('Secrets Manager returned an empty SecretString for the app secret');
      }
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(raw);
      } catch (e) {
        throw new Error(`App secret is not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
      }

      const full = appSecretSchema.safeParse(parsedJson);
      if (full.success) {
        this.cache = full.data;
        return this.cache;
      }

      const legacy = legacyMcpOnly.safeParse(parsedJson);
      if (!legacy.success) {
        throw new Error(
          `Invalid app secret JSON: ${full.error.message}. Expected Terraform shape with httpApiBaseUrl, cognitoTokenUrl, mcpClientId, mcpClientSecret, …`
        );
      }

      const tokenUrl = process.env.COGNITO_TOKEN_URL?.trim();
      const httpApi = process.env.AWS_HTTP_API_BASE_URL?.trim();
      if (!tokenUrl || !httpApi) {
        throw new Error(
          'Legacy secret only has clientId/clientSecret; set COGNITO_TOKEN_URL and AWS_HTTP_API_BASE_URL in supply-chain/.env, or migrate to Terraform-managed full JSON secret.'
        );
      }
      const scope =
        process.env.COGNITO_MCP_SCOPE ?? 'supply-chain/order.read supply-chain/order.write';
      this.cache = {
        httpApiBaseUrl: httpApi,
        cognitoTokenUrl: tokenUrl,
        mcpClientId: legacy.data.clientId,
        mcpClientSecret: legacy.data.clientSecret,
        cognitoOAuthScope: scope
      };
      return this.cache;
    } catch (err) {
      const warningMessage = `AWS Secrets Manager resolution failed: ${
        err instanceof Error ? err.message : String(err)
      }. Using environment variables fallback.`;

      console.warn(`[SupplyChainAppConfigService] ⚠️ ${warningMessage}`);

      appendRuntimeLog({
        level: 'WARNING',
        where: 'SupplyChainAppConfigService.get',
        message: warningMessage,
        error: err instanceof Error ? err.stack : String(err)
      });

      const httpApi = process.env.VITE_AWS_HTTP_API_BASE_URL?.trim() || 
                      process.env.NEXT_PUBLIC_AWS_HTTP_API_BASE_URL?.trim() || 
                      process.env.AWS_HTTP_API_BASE_URL?.trim();

      const cognitoAuthority = process.env.VITE_COGNITO_AUTHORITY?.trim() || 
                               process.env.NEXT_PUBLIC_COGNITO_AUTHORITY?.trim();

      const cognitoTokenUrl = process.env.COGNITO_TOKEN_URL?.trim() || 
                              (cognitoAuthority ? `${cognitoAuthority.replace(/\/$/, '')}/oauth2/token` : '');

      const webClientId = process.env.VITE_COGNITO_WEB_CLIENT_ID?.trim() || 
                          process.env.NEXT_PUBLIC_COGNITO_WEB_CLIENT_ID?.trim();

      const mcpClientId = process.env.COGNITO_MCP_CLIENT_ID?.trim() || 'dummy-mcp-client-id';
      const mcpClientSecret = process.env.COGNITO_MCP_CLIENT_SECRET?.trim() || 'dummy-mcp-client-secret';
      const scope = process.env.COGNITO_MCP_SCOPE?.trim() ?? 'supply-chain/order.read supply-chain/order.write';

      if (!httpApi) {
        throw new Error(
          `AWS Secrets Manager query failed (${
            err instanceof Error ? err.message : String(err)
          }), and no fallback VITE_AWS_HTTP_API_BASE_URL or NEXT_PUBLIC_AWS_HTTP_API_BASE_URL is present in the environment.`
        );
      }

      this.cache = {
        httpApiBaseUrl: httpApi,
        cognitoTokenUrl: cognitoTokenUrl || 'https://cognito-idp.us-east-2.amazonaws.com/oauth2/token',
        webClientId,
        mcpClientId,
        mcpClientSecret,
        cognitoOAuthScope: scope
      };

      return this.cache;
    }
  }

  /** Default M2M OAuth scope (space-separated Cognito resource scopes). */
  async oauthScope(): Promise<string> {
    const c = await this.get();
    return c.cognitoOAuthScope ?? 'supply-chain/order.read supply-chain/order.write';
  }
}
