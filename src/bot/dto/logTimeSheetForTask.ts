import { ApiProperty } from '@nestjs/swagger';

export enum ETimeSheetTaskName {
  CODING = 'Coding',
  TESTING = 'Testing',
  PROJECT_MANAGEMENT = 'Project Management',
  MEETING_CLIENT = 'Meeting Client',
  DOCUMENTING = 'Documenting',
  REVIEW_CODE = 'Review Code',
}

export class LogTimeSheetForTaskDTO {
  @ApiProperty({ example: 'Implement login API' })
  note: string;

  @ApiProperty({
    example: '1827997372997558272',
    description: 'Mezon user ID',
  })
  mezon_id: string;

  @ApiProperty({
    example: 0,
    default: 0,
    required: false,
    description: '0: Normal Time, 1: Overtime',
  })
  typeOfWork?: number;

  @ApiProperty({
    enum: ETimeSheetTaskName,
    enumName: 'ETimeSheetTaskName',
    example: ETimeSheetTaskName.CODING,
    default: ETimeSheetTaskName.CODING,
    required: false,
  })
  taskName?: ETimeSheetTaskName;

  @ApiProperty({ example: 8, default: 8, required: false })
  hour?: number;
}
