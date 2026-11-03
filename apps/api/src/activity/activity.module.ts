import { Global, Module } from '@nestjs/common'
import { NotificationsModule } from '../notifications/notifications.module'
import { ActivityController } from './activity.controller'
import { ActivityQueryService } from './activity-query.service'
import { ActivityService } from './activity.service'

@Global()
@Module({
  imports: [NotificationsModule],
  controllers: [ActivityController],
  providers: [ActivityService, ActivityQueryService],
  exports: [ActivityService, ActivityQueryService, NotificationsModule],
})
export class ActivityModule {}
