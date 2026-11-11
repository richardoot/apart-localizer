import { Module } from '@nestjs/common'
import { OpenTasksController, TasksController } from './tasks.controller'
import { TasksService } from './tasks.service'

@Module({
  controllers: [TasksController, OpenTasksController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
