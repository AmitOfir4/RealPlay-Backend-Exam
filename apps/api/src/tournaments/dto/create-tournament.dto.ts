import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsNotEmpty, IsString } from 'class-validator';
import { EXAMPLE_END_OF_TOMORROW_ISO, EXAMPLE_NOW_ISO } from './example-dates';

export class CreateTournamentDto {
  @ApiProperty({ example: 'Weekly Cup' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: EXAMPLE_NOW_ISO, description: 'Defaults to now for easy testing.' })
  @IsISO8601()
  startsAt: string;

  @ApiProperty({
    example: EXAMPLE_END_OF_TOMORROW_ISO,
    description: 'Must be after startsAt. Defaults to end of tomorrow.',
  })
  @IsISO8601()
  endsAt: string;
}
