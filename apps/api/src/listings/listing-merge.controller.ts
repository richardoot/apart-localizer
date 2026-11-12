import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { CurrentMember } from '../auth/decorators/current-member.decorator'
import { SupabaseGuard } from '../auth/guards/supabase.guard'
import type { Member } from '../generated/prisma'
import { EvaluatedListingDto } from './dto/listing.dto'
import {
  DuplicateDistinctInputDto,
  ListingMergeInputDto,
  ListingMergePreviewDto,
  ListingMergePreviewQueryDto,
  ListingMergeResultDto,
  ListingSellerInputDto,
  ListingSellerWriteResultDto,
  SimilarListingsQueryDto,
  SimilarListingsResultDto,
} from './dto/listing-merge.dto'
import { ListingMergeService } from './listing-merge.service'
import { ListingSellersService } from './listing-sellers.service'
import { SimilarListingsService } from './similar-listings.service'

/**
 * Lot 27 (ADR 0037) : retrouver une annonce « déjà vue » par ressemblance,
 * fusionner deux fiches du même bien (la fusion s'annule pendant sept jours,
 * puis la fiche absorbée est supprimée : lot 30), dire que deux fiches qui se
 * ressemblent sont deux biens différents, enregistrer chaque agence qui vend le bien avec sa référence. Le
 * MCP passe par les mêmes services (`find_similar_listings`,
 * `merge_listings`, `add_listing_seller`) ; l'annulation d'une fusion et le
 * retrait d'une agence n'existent qu'ici. Déclaré avant `ListingsController`
 * dans le module : `/listings/similar` passe avant `/listings/:id`.
 */
@ApiTags('listings')
@ApiBearerAuth()
@UseGuards(SupabaseGuard)
@Controller()
export class ListingMergeController {
  constructor(
    private readonly similar: SimilarListingsService,
    private readonly merges: ListingMergeService,
    private readonly sellers: ListingSellersService
  ) {}

  @Get('listings/similar')
  @ApiOperation({
    summary:
      'Les annonces de l’espace (écartées comprises) qui ressemblent à une annonce (`listingId`), à un brouillon « À valider » (`draftId`) ou à un texte cherché (`q`), de la plus ressemblante à la moins ressemblante, avec ce qui concorde et ce qui diffère ; lecture seule',
  })
  @ZodResponse({ status: 200, type: SimilarListingsResultDto })
  findSimilar(
    @CurrentMember() member: Member,
    @Query() query: SimilarListingsQueryDto
  ): Promise<SimilarListingsResultDto> {
    return this.similar.find(member, query)
  }

  @Get('listings/:id/merge-preview')
  @ApiOperation({
    summary:
      'Ce que ferait la fusion de la fiche `with` dans la fiche `:id` (gardée) : ce qui la rejoint, les champs complétés, ceux qui diffèrent, les agences, ce qui reste ; laquelle il vaut mieux garder ; rien n’est écrit',
  })
  @ZodResponse({ status: 200, type: ListingMergePreviewDto })
  preview(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListingMergePreviewQueryDto
  ): Promise<ListingMergePreviewDto> {
    return this.merges.preview(member, id, query.with)
  }

  @Post('listings/:id/merge')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Fusionne la fiche `absorbedId` (doublon) dans la fiche `:id` : liens, agences et références, visites, offres, avis, tâches et questions la rejoignent, ses champs vides sont complétés, son prix suit ses liens ; le doublon est écarté et caché des listes, puis supprimé sept jours après (la fusion s’annule d’ici là) ; la question « même bien ? » de la paire est tranchée ; journalisé des deux côtés ; refusé (409) si une des deux est déjà fusionnée',
  })
  @ZodResponse({ status: 200, type: ListingMergeResultDto })
  merge(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ListingMergeInputDto
  ): Promise<ListingMergeResultDto> {
    return this.merges.merge(member, id, body, 'web')
  }

  @Post('listing-merges/:mergeId/undo')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Annule une fusion : ce qui était venu du doublon y retourne, les champs complétés non retouchés se vident, le doublon retrouve son statut et sa place dans les listes ; journalisé ; refusé (409) après sept jours',
  })
  @ZodResponse({ status: 200, type: ListingMergeResultDto })
  undo(
    @CurrentMember() member: Member,
    @Param('mergeId', ParseUUIDPipe) mergeId: string
  ): Promise<ListingMergeResultDto> {
    return this.merges.undo(member, mergeId)
  }

  @Post('listings/:id/duplicate-distinct')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Lot 30 : la fiche `otherId` n’est pas le même bien que la fiche `:id` ; la question « même bien ? » de la paire est tranchée et la paire n’est plus signalée comme doublon ; journalisé des deux côtés',
  })
  @ZodResponse({ status: 200, type: EvaluatedListingDto })
  distinct(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: DuplicateDistinctInputDto
  ): Promise<EvaluatedListingDto> {
    return this.merges.declareDistinct(member, id, body.otherId)
  }

  @Post('listings/:id/sellers')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Ajoute une autre agence qui vend le même bien, avec sa référence (elle devient l’agence principale si la fiche n’en avait pas) ; refusé (409) si elle est déjà sur la fiche, ou si cette agence et cette référence sont celles d’une autre annonce (à fusionner) ; journalisé',
  })
  @ZodResponse({ status: 200, type: ListingSellerWriteResultDto })
  addSeller(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ListingSellerInputDto
  ): Promise<ListingSellerWriteResultDto> {
    return this.sellers.add(member, id, body, {
      channel: 'web',
      origin: 'manual',
    })
  }

  @Delete('listings/:id/sellers/:sellerId')
  @ApiOperation({
    summary:
      'Retire une autre agence de la fiche (un membre, dans l’application) ; journalisé',
  })
  @ZodResponse({ status: 200, type: ListingSellerWriteResultDto })
  removeSeller(
    @CurrentMember() member: Member,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sellerId', ParseUUIDPipe) sellerId: string
  ): Promise<ListingSellerWriteResultDto> {
    return this.sellers.remove(member, id, sellerId)
  }
}
