/**
 * @file aws-connectivity.health.ts
 * @summary MCP `@HealthCheck` — validates AWS credentials via STS GetCallerIdentity.
 * @context Uses default credential chain from `supply-chain/.env`. Details avoid full ARN exposure.
 */

import { HealthCheck, HealthCheckInterface, HealthCheckResult } from '@nitrostack/core';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { randomUUID } from 'node:crypto';

@HealthCheck({ name: 'aws-connectivity', description: 'STS GetCallerIdentity against your AWS account', interval: 60 })
export class AwsConnectivityHealthCheck implements HealthCheckInterface {
  private readonly sts = new STSClient({});

  async check(): Promise<HealthCheckResult> {
    const correlationId = randomUUID();
    try {
      const id = await this.sts.send(new GetCallerIdentityCommand({}));
      const acct = id.Account ?? '';
      return {
        status: 'up',
        message: 'AWS credentials are valid',
        details: {
          correlationId,
          accountIdSuffix: acct.length > 4 ? acct.slice(-4) : acct,
          principalType: id.Arn?.includes(':assumed-role/') ? 'assumed-role' : 'iam-user-or-other'
        }
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      try {
        process.stderr.write(
          JSON.stringify({
            level: 'WARN',
            correlationId,
            where: 'AwsConnectivityHealthCheck',
            message,
            stack
          }) + '\n'
        );
      } catch (e) {
        // Prevent EPIPE crash if stderr is closed
      }
      return {
        status: 'degraded',
        message: 'AWS credential check failed or keys expired. Using browser Cognito JWT auth path.',
        details: { correlationId, error: message }
      };
    }
  }
}
