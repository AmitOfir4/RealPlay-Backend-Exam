import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BetsService } from './bets.service';
import { IngestBetDto } from './dto/ingest-bet.dto';

@ApiTags('bets')
@Controller('bet')
export class BetsController {
  constructor(private readonly bets: BetsService) {}

  // Duplicates are a success (200), not an error — the event is simply
  // acknowledged without counting twice.
  @Post()
  @HttpCode(200)
  @ApiOperation({
    summary: 'Ingest a bet event',
    description:
      'Counts the bet towards every ACTIVE tournament whose window contains createdAt. ' +
      'Idempotent per (tournament, externalBetId): replaying a bet returns 200 with duplicate=true and does not change the score.',
  })
  @ApiOkResponse({
    description: 'Bet acknowledged. results is empty when no tournament window matched.',
    schema: {
      example: {
        externalBetId: 'bet_123456',
        results: [{ tournamentId: '3f2a…', accepted: true, duplicate: false }],
      },
    },
  })
  ingest(@Body() dto: IngestBetDto) {
    return this.bets.ingest(dto);
  }
}
