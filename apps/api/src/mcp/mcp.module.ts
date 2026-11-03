import { Module } from '@nestjs/common'
import { AssumptionsModule } from '../assumptions/assumptions.module'
import { ListingsModule } from '../listings/listings.module'
import { OffersModule } from '../offers/offers.module'
import { OpinionsModule } from '../opinions/opinions.module'
import { TasksModule } from '../tasks/tasks.module'
import { McpAuthGuard } from './mcp-auth.guard'
import { McpController } from './mcp.controller'
import { OAuthDiscoveryService } from './oauth-discovery.service'
import { WellKnownController } from './well-known.controller'

/**
 * Le connecteur MCP : l'endpoint `/mcp`, son garde, la découverte OAuth. Il
 * orchestre les services des autres modules et n'a pas de logique métier.
 */
@Module({
  imports: [
    ListingsModule,
    AssumptionsModule,
    OpinionsModule,
    TasksModule,
    OffersModule,
  ],
  controllers: [McpController, WellKnownController],
  providers: [McpAuthGuard, OAuthDiscoveryService],
  exports: [OAuthDiscoveryService],
})
export class McpModule {}
