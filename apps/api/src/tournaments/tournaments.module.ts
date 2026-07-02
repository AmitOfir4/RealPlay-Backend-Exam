import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { LeaderboardStore } from '../../../../libs/shared/src/leaderboard/leaderboard.store';
import { TOURNAMENTS_QUEUE } from '../../../../libs/shared/src/queue/queue.constants';
import { BetsController } from './bets.controller';
import { BetsService } from './bets.service';
import { LeaderboardService } from './leaderboard.service';
import { TournamentsController } from './tournaments.controller';
import { TournamentsService } from './tournaments.service';

@Module({
  imports: [BullModule.registerQueue({ name: TOURNAMENTS_QUEUE })],
  controllers: [TournamentsController, BetsController],
  providers: [TournamentsService, BetsService, LeaderboardService, LeaderboardStore],
})
export class TournamentsModule {}
