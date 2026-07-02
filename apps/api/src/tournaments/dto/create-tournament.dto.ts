import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsNotEmpty, IsString } from 'class-validator';
import { EXAMPLE_END_OF_TOMORROW_ISO, EXAMPLE_NOW_ISO } from './example-dates';

export class CreateTournamentDto {
  @ApiProperty({ example: 'Weekly Cup' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    example: EXAMPLE_NOW_ISO,
    description: 'Tournament start (required). The docs pre-fill with the current time for convenience.',
  })
  @IsISO8601()
  startsAt: string;

  @ApiProperty({
    example: EXAMPLE_END_OF_TOMORROW_ISO,
    description:
      'Tournament end (required); must be after startsAt. The docs pre-fill with end of tomorrow for convenience.',
  })
  @IsISO8601()
  endsAt: string;
}
