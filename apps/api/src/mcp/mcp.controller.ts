import {
  Controller,
  Delete,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common'
import { ApiExcludeController } from '@nestjs/swagger'
import type { Request, Response } from 'express'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { DuplicatesService } from '../listings/duplicates.service'
import { ExtractionService } from '../listings/extraction.service'
import { ListingsService } from '../listings/listings.service'
import { TargetPriceService } from '../listings/target-price.service'
import { ListingEnrichmentService } from '../listings/enrichment.service'
import { SearchCriteriaService } from '../search-criteria/search-criteria.service'
import { AssumptionsService } from '../assumptions/assumptions.service'
import { OffersService } from '../offers/offers.service'
import { OpinionsService } from '../opinions/opinions.service'
import { TasksService } from '../tasks/tasks.service'
import { WorkspaceService } from '../workspace/workspace.service'
import { StudyService } from '../study/study.service'
import { ScenariosService } from '../study/scenarios.service'
import { RentComparablesService } from '../study/rent-comparables.service'
import { ComplianceService } from '../study/compliance.service'
import { VisitsService } from '../visits/visits.service'
import { WhatsNewService } from '../whats-new/whats-new.service'
import { ListingChecksService } from '../listings/listing-checks.service'
import { ListingLinksService } from '../listings/listing-links.service'
import { registerLinkTools } from './mcp-links'
import { ExplorationsService } from '../exploration/explorations.service'
import { registerCheckPrompts, registerCheckTools } from './mcp-checks'
import {
  registerExplorationPrompts,
  registerExplorationTools,
} from './mcp-exploration'
import { AgencyRequestsService } from '../agency-requests/agency-requests.service'
import { DecisionsService } from '../decisions/decisions.service'
import { registerAgencyPrompts, registerAgencyTools } from './mcp-agency'
import { McpAuthGuard } from './mcp-auth.guard'
import type { McpAuthenticatedRequest } from './mcp-auth.guard'
import { registerPrompts, registerResources, registerTools } from './mcp-tools'

export const MCP_SERVER_INFO = { name: 'apart-localizer', version: '0.1.0' }

/**
 * Le serveur MCP, en HTTP « streamable » sans session : chaque appel est une
 * requête HTTP complète passée par McpAuthGuard, servie par un serveur et un
 * transport construits pour elle. Rien à garder entre deux appels, rien à
 * perdre quand une fonction serverless redémarre. Les réponses sont en JSON
 * (pas de flux SSE) : un appel, une réponse.
 */
@ApiExcludeController()
@Controller('mcp')
@UseGuards(McpAuthGuard)
export class McpController {
  constructor(
    private readonly listings: ListingsService,
    private readonly extraction: ExtractionService,
    private readonly duplicates: DuplicatesService,
    private readonly assumptions: AssumptionsService,
    private readonly opinions: OpinionsService,
    private readonly tasks: TasksService,
    private readonly workspace: WorkspaceService,
    private readonly offers: OffersService,
    private readonly targetPrice: TargetPriceService,
    private readonly criteria: SearchCriteriaService,
    private readonly enrichment: ListingEnrichmentService,
    private readonly study: StudyService,
    private readonly scenarios: ScenariosService,
    private readonly comparables: RentComparablesService,
    private readonly compliance: ComplianceService,
    private readonly visits: VisitsService,
    private readonly whatsNew: WhatsNewService,
    private readonly checks: ListingChecksService,
    private readonly agency: AgencyRequestsService,
    private readonly exploration: ExplorationsService,
    private readonly links: ListingLinksService,
    private readonly decisions: DecisionsService
  ) {}

  @Post()
  async post(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.serve(req as McpAuthenticatedRequest, res, req.body as unknown)
  }

  /** Sans session il n'y a pas de flux serveur à ouvrir : le transport répond 405. */
  @Get()
  async get(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.serve(req as McpAuthenticatedRequest, res)
  }

  @Delete()
  async delete(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.serve(req as McpAuthenticatedRequest, res)
  }

  private async serve(
    req: McpAuthenticatedRequest,
    res: Response,
    body?: unknown
  ): Promise<void> {
    const server = new McpServer(MCP_SERVER_INFO)
    const context = {
      member: req.member,
      scopes: req.mcpScopes,
      listings: this.listings,
      extraction: this.extraction,
      duplicates: this.duplicates,
      assumptions: this.assumptions,
      opinions: this.opinions,
      tasks: this.tasks,
      workspace: this.workspace,
      offers: this.offers,
      targetPrice: this.targetPrice,
      criteria: this.criteria,
      enrichment: this.enrichment,
      study: this.study,
      scenarios: this.scenarios,
      comparables: this.comparables,
      compliance: this.compliance,
      visits: this.visits,
      whatsNew: this.whatsNew,
      checks: this.checks,
      exploration: this.exploration,
      agency: this.agency,
      links: this.links,
      decisions: this.decisions,
    }
    registerTools(server, context)
    // Lot 15 : vérification des annonces sur le portail.
    registerCheckTools(server, context)
    // Lot 16 : exploration des portails par les critères.
    registerExplorationTools(server, context)
    // Lot 17 : questions aux agences.
    registerAgencyTools(server, context)
    // Lot 18 : une annonce, plusieurs portails.
    registerLinkTools(server, context)
    registerPrompts(server)
    registerCheckPrompts(server)
    registerExplorationPrompts(server)
    registerAgencyPrompts(server)
    registerResources(server)
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    })
    try {
      await server.connect(transport)
      await transport.handleRequest(req, res, body)
    } finally {
      await server.close()
    }
  }
}
