import { Module } from '@nestjs/common'
import { WorkspaceController } from './workspace.controller'
import { WorkspaceService } from './workspace.service'
import { MembersService } from './members.service'

/**
 * L'espace et ses membres. `ActivityService` et `NotificationDispatcher`
 * viennent du module global `ActivityModule` (qui réexporte les
 * notifications).
 */
@Module({
  controllers: [WorkspaceController],
  providers: [WorkspaceService, MembersService],
  exports: [WorkspaceService, MembersService],
})
export class WorkspaceModule {}
