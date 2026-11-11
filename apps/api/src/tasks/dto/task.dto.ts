import { createZodDto } from 'nestjs-zod'
import {
  OpenTasksSchema,
  TaskInputSchema,
  TaskSchema,
  TaskUpdateSchema,
} from '@apart/contracts'

export class TaskInputDto extends createZodDto(TaskInputSchema) {}
export class TaskUpdateDto extends createZodDto(TaskUpdateSchema) {}
export class TaskDto extends createZodDto(TaskSchema) {}
export class OpenTasksDto extends createZodDto(OpenTasksSchema) {}
