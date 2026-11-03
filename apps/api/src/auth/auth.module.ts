import { Global, Module } from '@nestjs/common'
import { SupabaseService } from './supabase.service'
import { SupabaseGuard } from './guards/supabase.guard'
import { WorkspaceModule } from '../workspace/workspace.module'

/**
 * Global, so that every controller can `@UseGuards(SupabaseGuard)` without
 * importing anything. The guard needs WorkspaceService to resolve the member,
 * hence the re-export of WorkspaceModule.
 */
@Global()
@Module({
  imports: [WorkspaceModule],
  providers: [SupabaseService, SupabaseGuard],
  exports: [SupabaseService, SupabaseGuard, WorkspaceModule],
})
export class AuthModule {}
