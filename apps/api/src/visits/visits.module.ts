import { Module } from '@nestjs/common'
import { createSupabasePhotoStorage, PHOTO_STORAGE } from './photo-storage'
import { VisitsController } from './visits.controller'
import { VISITS_CONFIG, VisitsService, visitsConfig } from './visits.service'

/**
 * Les visites et leurs photos (besoin S4). Le stockage est injecté : le
 * client Supabase Storage (clé service_role) en vrai, un faux dans les tests.
 */
@Module({
  controllers: [VisitsController],
  providers: [
    { provide: VISITS_CONFIG, useFactory: () => visitsConfig(process.env) },
    {
      provide: PHOTO_STORAGE,
      useFactory: () =>
        createSupabasePhotoStorage(
          process.env.SUPABASE_URL ?? '',
          process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
          process.env.STORAGE_BUCKET_VISIT_PHOTOS?.trim() || 'visit-photos'
        ),
    },
    VisitsService,
  ],
  exports: [VisitsService],
})
export class VisitsModule {}
