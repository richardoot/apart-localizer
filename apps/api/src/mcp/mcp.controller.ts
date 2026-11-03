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
    private readonly enrichment: ListingEnrichmentService
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
    registerTools(server, {
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
    })
    registerPrompts(server)
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
