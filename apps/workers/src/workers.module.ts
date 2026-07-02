import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LeaderboardStore } from '../../../libs/shared/src/leaderboard/leaderboard.store';
import { PrismaModule } from '../../../libs/shared/src/prisma/prisma.module';
import { TOURNAMENTS_QUEUE } from '../../../libs/shared/src/queue/queue.constants';
import { RedisModule } from '../../../libs/shared/src/redis/redis.module';
import { FinalizeProcessor } from './finalize/finalize.processor';
import { SweeperService } from './finalize/sweeper.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get('REDIS_HOST', 'localhost'),
          port: Number(config.get('REDIS_PORT', 6379)),
          maxRetriesPerRequest: null,
        },
      }),
    }),
    BullModule.registerQueue({ name: TOURNAMENTS_QUEUE }),
    PrismaModule,
    RedisModule,
  ],
  providers: [FinalizeProcessor, SweeperService, LeaderboardStore],
})
export class WorkersModule {}
