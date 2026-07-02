import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS } from '../redis/redis.module';

export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  score: number;
}

export interface ApplyBetCommand {
  tournamentId: string;
  externalBetId: string;
  playerId: string;
  amount: number;
}

const betIdsKey = (tournamentId: string) => `t:{${tournamentId}}:betIds`;
const leaderboardKey = (tournamentId: string) => `t:{${tournamentId}}:lb`;

// Atomic check-and-increment so concurrent duplicates can't double-count.
// Returns 1 if applied, 0 if already counted.
const APPLY_BET_LUA = `
if redis.call('SADD', KEYS[1], ARGV[1]) == 1 then
  redis.call('ZINCRBY', KEYS[2], ARGV[2], ARGV[3])
  return 1
end
return 0
`;

declare module 'ioredis' {
  interface RedisCommander {
    applyBet(
      betIdsKey: string,
      leaderboardKey: string,
      externalBetId: string,
      amount: number,
      playerId: string,
    ): Promise<number>;
  }
}

@Injectable()
export class LeaderboardStore {
  constructor(@Inject(REDIS) private readonly redis: Redis) {
    this.redis.defineCommand('applyBet', { numberOfKeys: 2, lua: APPLY_BET_LUA });
  }

  /** One Lua call per tournament, pipelined. Returns whether each was newly applied. */
  async applyBets(commands: ApplyBetCommand[]): Promise<boolean[]> {
    if (commands.length === 0) return [];
    const pipeline = this.redis.pipeline();
    for (const cmd of commands) {
      pipeline.applyBet(
        betIdsKey(cmd.tournamentId),
        leaderboardKey(cmd.tournamentId),
        cmd.externalBetId,
        cmd.amount,
        cmd.playerId,
      );
    }
    const results = (await pipeline.exec()) ?? [];
    return results.map(([err, applied]) => {
      if (err) throw err;
      return applied === 1;
    });
  }

  async getPage(
    tournamentId: string,
    offset: number,
    limit: number,
  ): Promise<{ total: number; entries: LeaderboardEntry[] }> {
    const [raw, total] = await Promise.all([
      this.redis.zrange(leaderboardKey(tournamentId), offset, offset + limit - 1, 'REV', 'WITHSCORES'),
      this.redis.zcard(leaderboardKey(tournamentId)),
    ]);
    const entries: LeaderboardEntry[] = [];
    for (let i = 0; i < raw.length; i += 2) {
      entries.push({
        rank: offset + i / 2 + 1,
        playerId: raw[i],
        score: Number(raw[i + 1]),
      });
    }
    return { total, entries };
  }

  /** Keep live keys around briefly after finalization, then let them expire. */
  async expire(tournamentId: string, ttlSeconds: number): Promise<void> {
    await this.redis
      .pipeline()
      .expire(betIdsKey(tournamentId), ttlSeconds)
      .expire(leaderboardKey(tournamentId), ttlSeconds)
      .exec();
  }
}
