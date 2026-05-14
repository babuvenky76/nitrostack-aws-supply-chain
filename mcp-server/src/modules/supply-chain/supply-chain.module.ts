/**
 * @file supply-chain.module.ts
 * @summary NitroStack feature module: tools, resources, prompts + AWS HTTP/Cognito providers.
 */

import { Module } from '@nitrostack/core';
import { CognitoM2mTokenService } from '../../common/cognito-m2m-token.service.js';
import { SupplyChainAppConfigService } from '../../common/supply-chain-app-config.service.js';
import { SupplyChainApiService } from '../../common/supply-chain-api.service.js';
import { SupplyChainTools } from './supply-chain.tools.js';
import { SupplyChainResources } from './supply-chain.resources.js';
import { SupplyChainPrompts } from './supply-chain.prompts.js';

@Module({
  name: 'supply-chain',
  description: 'AWS-backed catalog + orders with NitroStack decorators',
  controllers: [SupplyChainTools, SupplyChainResources, SupplyChainPrompts],
  providers: [SupplyChainAppConfigService, CognitoM2mTokenService, SupplyChainApiService]
})
export class SupplyChainModule {}
