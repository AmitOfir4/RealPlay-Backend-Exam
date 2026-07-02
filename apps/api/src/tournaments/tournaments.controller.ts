import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { LeaderboardService } from './leaderboard.service';
import { TournamentsService } from './tournaments.service';

@ApiTags('tournaments')
@Controller('tournaments')
export class TournamentsController {
  constructor(
    private readonly tournaments: TournamentsService,
    private readonly leaderboard: LeaderboardService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Create a tournament',
    description: 'Schedules the finalize job that snapshots the leaderboard shortly after endsAt.',
  })
  create(@Body() dto: CreateTournamentDto) {
    return this.tournaments.create(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List active tournaments (paginated)',
    description: 'Returns ACTIVE (not yet finalized) tournaments, newest first.',
  })
  @ApiOkResponse({
    schema: {
      example: {
        total: 2,
        limit: 20,
        offset: 0,
        items: [
          {
            id: '3f2a…',
            name: 'Weekly Cup',
            startsAt: '2026-07-02T00:00:00.000Z',
            endsAt: '2026-07-03T23:59:59.999Z',
            status: 'ACTIVE',
            createdAt: '2026-07-02T12:00:00.000Z',
          },
        ],
      },
    },
  })
  listActive(@Query() query: PaginationQueryDto) {
    return this.tournaments.listActive(query.offset, query.limit);
  }

  @Get(':id/leaderboard')
  @ApiOperation({
    summary: 'Get the leaderboard (paginated, score DESC)',
    description:
      'Served live from Redis while ACTIVE, or from persisted placements once FINALIZED. ' +
      'The "source" field indicates which.',
  })
  @ApiOkResponse({
    schema: {
      example: {
        tournamentId: '3f2a…',
        source: 'live',
        total: 2,
        limit: 20,
        offset: 0,
        entries: [
          { rank: 1, playerId: 'player_7', score: 900 },
          { rank: 2, playerId: 'player_42', score: 250 },
        ],
      },
    },
  })
  getLeaderboard(@Param('id') id: string, @Query() query: PaginationQueryDto) {
    return this.leaderboard.getPage(id, query.offset, query.limit);
  }
}
