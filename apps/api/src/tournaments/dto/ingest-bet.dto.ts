import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsISO8601, IsNotEmpty, IsString, Min } from 'class-validator';
import { EXAMPLE_NOW_ISO } from './example-dates';

export class IngestBetDto {
  @ApiProperty({ example: 'bet_123456', description: 'Unique bet id from the client; counted once per tournament.' })
  @IsString()
  @IsNotEmpty()
  externalBetId: string;

  @ApiProperty({ example: 'player_42' })
  @IsString()
  @IsNotEmpty()
  playerId: string;

  @ApiProperty({ example: 250, description: 'Amount in cents (250 = $2.50). Positive integer.' })
  @IsInt()
  @Min(1)
  amount: number; // cents

  @ApiProperty({ example: 'USD' })
  @IsString()
  @IsNotEmpty()
  currency: string;

  @ApiProperty({
    example: EXAMPLE_NOW_ISO,
    description: 'Event time (defaults to now). Counts only where startsAt <= createdAt <= endsAt.',
  })
  @IsISO8601()
  createdAt: string;
}
