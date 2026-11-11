import {
  Body,
  ConflictException,
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
import { LayerDto } from '../opendata/dto/opendata.dto'
import { DuplicatesService } from './duplicates.service'
import { ListingEnrichmentService } from './enrichment.service'
import { ExtractionService } from './extraction.service'
import { ListingsService } from './listings.service'
import { TargetPriceService } from './target-price.service'
import {
  CompareRequestDto,
  CompareResultDto,
  CreateListingDto,
  DpeVerifyRequestDto,
  ListingContextDto,
  MarketContextDto,
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
    private readonly targetPrice: TargetPriceService,
    private readonly enrichment: ListingEnrichmentService
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Annonces filtrées, calculées, triées et paginées',
    description:
      'Listes séparées par des virgules (status, commune, dpe, verdict) ; bornes priceMin, priceMax, surfaceMin, surfaceMax, roomsMin ; ' +
      'point et rayon : lng, lat, radius (mètres) ; page et limit (50 par défaut, 200 au plus). ' +
      'Le verdict, le tri et la pagination s’appliquent après le calcul des indicateurs. ' +
      'Lot 14 : fit (in, to_confirm, margin, out) filtre par adéquation aux critères actifs ; absent = l’onglet « Dans les critères » (et les hors critères gardées pour une offre en cours ou une visite prévue) ; la réponse compte les annonces par niveau (fit).',
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

  @Get('areas')
  @ApiOperation({
    summary:
      'Lot 12 : contours des annonces placées au quartier (GeoJSON, simplifiés à 5 m), pour la carte : `properties.listingId`, `name`, `level`',
  })
  @ZodResponse({ status: 200, type: LayerDto })
  areas(@CurrentMember() member: Member): Promise<LayerDto> {
    return this.listings.areas(member)
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

  @Get(':id/context')
  @ApiOperation({
    summary:
      'Contexte open data : arrêt de tram le plus proche, plafond d’encadrement (Bordeaux), DPE vérifié et sa validité, comparables DVF ; calculé à la lecture',
  })
  @ZodResponse({ status: 200, type: ListingContextDto })
  context(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<ListingContextDto> {
    return this.enrichment.context(member, id)
  }

  @Get(':id/market')
  @ApiOperation({
    summary:
      'Comparables DVF : ventes d’appartements dans un rayon (500 m, élargi à 1 000 puis 2 000 m), surface ±25 %, trois ans ; médiane au m², dispersion, liste datée',
  })
  @ZodResponse({ status: 200, type: MarketContextDto })
  market(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<MarketContextDto> {
    return this.enrichment.marketOf(member, id)
  }

  @Post(':id/geocode')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Relance le géocodage (sans cache) puis les enrichissements : point, adresse normalisée, BAN, plafond, marché, DPE ; critères recalculés',
  })
  @ZodResponse({ status: 200, type: EvaluatedListingDto })
  regeocode(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<EvaluatedListingDto> {
    return this.listings.regeocode(member, id)
  }

  @Post(':id/dpe/search')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Cherche le DPE à l’observatoire ADEME (adresse BAN, sinon commune et surface) ; appliqué d’office s’il est seul et clair, sinon proposé',
  })
  @ZodResponse({ status: 200, type: ListingContextDto })
  async searchDpe(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<ListingContextDto> {
    await this.enrichment.searchDpe(member, id, 'web')
    // Un DPE appliqué d'office change la classe, que lit le filtre « DPE au plus ».
    await this.listings.afterWrite(member, id, 'web', 'dpe')
    return this.enrichment.context(member, id)
  }

  @Post(':id/dpe/verify')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Retient un DPE de la dernière recherche ADEME : classe, GES, consommation, date et numéro en provenance open data',
  })
  @ZodResponse({ status: 200, type: EvaluatedListingDto })
  async verifyDpe(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: DpeVerifyRequestDto
  ): Promise<EvaluatedListingDto> {
    const current = await this.listings.get(member, id)
    if (
      body.expectedUpdatedAt !== undefined &&
      Date.parse(body.expectedUpdatedAt) !==
        Date.parse(current.listing.updatedAt)
    ) {
      throw new ConflictException(
        `L'annonce a changé depuis ta lecture (modifiée le ${current.listing.updatedAt}) : relis-la`
      )
    }
    await this.enrichment.verifyDpe(member, id, body.number, 'web')
    // La classe retenue peut faire entrer l'annonce dans un critère ou l'en sortir.
    return this.listings.afterWrite(member, id, 'web', 'dpe')
  }
}
