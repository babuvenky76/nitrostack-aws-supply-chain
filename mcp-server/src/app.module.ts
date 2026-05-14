/**
 * @file app.module.ts
 * @summary Root NitroStack MCP application module — registers supply-chain feature module and health checks.
 * @context Entry module loaded from `index.ts` after env bootstrap.
 */

import { McpApp, Module, ConfigModule } from '@nitrostack/core';
import { SupplyChainModule } from './modules/supply-chain/supply-chain.module.js';
import { SystemHealthCheck } from './health/system.health.js';
import { AwsConnectivityHealthCheck } from './health/aws-connectivity.health.js';

@McpApp({
  module: AppModule,
  server: { name: 'SupplyChain-AWS-MCP', version: '1.0.0' },
  logging: { level: 'info' }
})
@Module({
  name: 'app',
  description: 'Supply chain — AWS Cognito + API Gateway + Lambda + DynamoDB (NitroStack showcase)',
  imports: [ConfigModule.forRoot(), SupplyChainModule],
  providers: [SystemHealthCheck, AwsConnectivityHealthCheck]
})
export class AppModule {}
