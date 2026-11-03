import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import {
  listingFiltersFromQuery,
  splitListingCreate,
  splitListingPatch,
} from '@apart/contracts'
import { SupabaseGuard } from '../auth/guards/supabase.guard'
import { CurrentMember } from '../auth/decorators/current-member.decorator'
import type { Member } from '../generated/prisma'
import { DuplicatesService } from './duplicates.service'
import { ExtractionService } from './extraction.service'
import { ListingsService } from './listings.service'
import { TargetPriceService } from './target-price.service'
import {
  CompareRequestDto,
  CompareResultDto,
  CreateListingDto,
  DuplicateCandidateDto,
  DuplicateProbeDto,
  EvaluateRequestDto,
  EvaluateResultDto,
  EvaluatedListingDto,
  ExtractionRequestDto,
  ExtractionResultDto,
  ListingCreateResultDto,
  ListingListDto,
  ListingListQueryDto,
  ListingPatchDto,
  ListingStatusChangeDto,
  NegotiationBriefDto,
  PriceEventDto,
  PriceEventInputDto,
  SensitivityGridDto,
  SensitivityRequestDto,
  TargetPriceReportDto,
} from './dto/listing.dto'

@ApiTags('listings')
@ApiBearerAuth()
@UseGuards(SupabaseGuard)
@Controller('listings')
export class ListingsController {
  constructor(
    private readonly listings: ListingsService,
    private readonly extraction: ExtractionService,
    private readonly duplicates: DuplicatesService,
    private readonly targetPrice: TargetPriceService
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Annonces filtrées, calculées, triées et paginées',
    description:
      'Listes séparées par des virgules (status, commune, dpe, verdict) ; bornes priceMin, priceMax, surfaceMin, surfaceMax, roomsMin ; ' +
      'point et rayon : lng, lat, radius (mètres) ; page et limit (50 par défaut, 200 au plus). ' +
      'Le verdict, le tri et la pagination s’appliquent après le calcul des indicateurs.',
  })
  @ZodResponse({ status: 200, type: ListingListDto })
  list(
    @CurrentMember() member: Member,
    @Query() query: ListingListQueryDto
  ): Promise<ListingListDto> {
    return this.listings.list(member, listingFiltersFromQuery(query))
  }

  @Post()
  @ApiOperation({
    summary:
      'Crée une annonce avec sa checklist par défaut ; géocode l’adresse, signale les doublons probables (sans bloquer) et pose une tâche par champ indispensable manquant quand la fiche vient de l’IA',
  })
  @ZodResponse({ status: 201, type: ListingCreateResultDto })
  create(
    @CurrentMember() member: Member,
    @Body() body: CreateListingDto
  ): Promise<ListingCreateResultDto> {
    const { input, ignoreDuplicates } = splitListingCreate(body)
    return this.listings.create(member, input, { ignoreDuplicates })
  }

  @Post('extract')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Extraction par IA : texte collé et/ou captures d’écran vers une fiche pré-remplie (provenance et confiance par champ), champs manquants, doublons probables ; rien n’est enregistré. 503 si ANTHROPIC_API_KEY n’est pas configurée.',
  })
  @ZodResponse({ status: 200, type: ExtractionResultDto })
  extract(
    @CurrentMember() member: Member,
    @Body() body: ExtractionRequestDto
  ): Promise<ExtractionResultDto> {
    return this.extraction.extract(member, body)
  }

  @Post('duplicates')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Doublons probables pour un lien, une adresse, un point, un trio commune + prix + surface, ou une annonce enregistrée',
  })
  @ZodResponse({ status: 200, type: [DuplicateCandidateDto] })
  findDuplicates(
    @CurrentMember() member: Member,
    @Body() body: DuplicateProbeDto
  ): Promise<DuplicateCandidateDto[]> {
    return this.duplicates.find(member, body)
  }

  @Post('evaluate')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Évalue une annonce hypothétique, ou une annonce enregistrée avec des surcharges, sans rien enregistrer',
  })
  @ZodResponse({ status: 200, type: EvaluateResultDto })
  evaluate(
    @CurrentMember() member: Member,
    @Body() body: EvaluateRequestDto
  ): Promise<EvaluateResultDto> {
    return this.listings.evaluate(member, body)
  }

  @Post('compare')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Compare 2 à 6 annonces côte à côte : indicateurs, prix cibles, rang par indicateur et meilleure annonce par indicateur',
  })
  @ZodResponse({ status: 200, type: CompareResultDto })
  compare(
    @CurrentMember() member: Member,
    @Body() body: CompareRequestDto
  ): Promise<CompareResultDto> {
    return this.targetPrice.compare(member, body.listingIds)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Une annonce, ses calculs, avis, tâches et prix' })
  @ZodResponse({ status: 200, type: EvaluatedListingDto })
  get(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<EvaluatedListingDto> {
    return this.listings.get(member, id)
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Met à jour des champs ; les sous-objets fournis sont remplacés ; garde-fous expectedUpdatedAt et expectedPrice (409)',
  })
  @ZodResponse({ status: 200, type: EvaluatedListingDto })
  update(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ListingPatchDto
  ): Promise<EvaluatedListingDto> {
    const { update, guards } = splitListingPatch(body)
    return this.listings.update(member, id, update, guards)
  }

  @Post(':id/status')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Change le statut, avec raison et garde-fou optimiste',
  })
  @ZodResponse({ status: 200, type: EvaluatedListingDto })
  setStatus(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ListingStatusChangeDto
  ): Promise<EvaluatedListingDto> {
    return this.listings.setStatus(member, id, body)
  }

  @Post(':id/seen')
  @HttpCode(200)
  @ApiOperation({
    summary: "Marque l'annonce comme vue par le membre connecté",
  })
  @ZodResponse({ status: 200, type: EvaluatedListingDto })
  markSeen(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<EvaluatedListingDto> {
    return this.listings.markSeen(member, id)
  }

  @Get(':id/target-price')
  @ApiOperation({
    summary:
      '« À partir de quel prix ? » : prix cibles par critère, critère liant, décote et sa classe, rang parmi les annonces actives, brief de négociation, détail des frais de notaire',
  })
  @ZodResponse({ status: 200, type: TargetPriceReportDto })
  targetPriceReport(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<TargetPriceReportDto> {
    return this.targetPrice.report(member, id)
  }

  @Post(':id/sensitivity')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Tableau de sensibilité à deux entrées (prix, loyer, taux, apport, durée), verdict par cellule, cellule courante repérée',
  })
  @ZodResponse({ status: 200, type: SensitivityGridDto })
  sensitivity(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SensitivityRequestDto
  ): Promise<SensitivityGridDto> {
    return this.targetPrice.sensitivity(member, id, body)
  }

  @Get(':id/negotiation')
  @ApiOperation({
    summary:
      'Brief de négociation : décote par critère, offre suggérée, marge, durée en ligne, baisses passées, arguments factuels',
  })
  @ZodResponse({ status: 200, type: NegotiationBriefDto })
  negotiation(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<NegotiationBriefDto> {
    return this.targetPrice.negotiation(member, id)
  }

  @Get(':id/price-events')
  @ApiOperation({
    summary: 'Historique des prix, du plus récent au plus ancien',
  })
  @ZodResponse({ status: 200, type: [PriceEventDto] })
  async priceEvents(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<PriceEventDto[]> {
    return (await this.listings.get(member, id)).priceEvents
  }

  @Post(':id/price-events')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Enregistre une baisse ou une hausse constatée : met le prix à jour et ajoute une ligne à l’historique',
  })
  @ZodResponse({ status: 200, type: EvaluatedListingDto })
  recordPriceChange(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: PriceEventInputDto
  ): Promise<EvaluatedListingDto> {
    return this.listings.recordPriceChange(member, id, body)
  }
}
