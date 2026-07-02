/**
 * Rebuilds a tournament's live Redis state (bet-id set + leaderboard ZSET)
 * from the durable Bet rows in Postgres. Redis is a derived view of the bets
 * table, so it can always be reconstructed after a Redis outage or flush.
 *
 * Usage: npm run rebuild:leaderboard -- <tournamentId>
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

async function main() {
  const tournamentId = process.argv[2];
  if (!tournamentId) {
    console.error('Usage: npm run rebuild:leaderboard -- <tournamentId>');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const redis = new Redis({
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
  });

  const bets = await prisma.bet.findMany({
    where: { tournamentId },
    select: { externalBetId: true, playerId: true, amount: true },
  });

  const betIdsKey = `t:{${tournamentId}}:betIds`;
  const leaderboardKey = `t:{${tournamentId}}:lb`;

  const scores = new Map<string, number>();
  for (const bet of bets) {
    scores.set(bet.playerId, (scores.get(bet.playerId) ?? 0) + bet.amount);
  }

  const pipeline = redis.pipeline();
  pipeline.del(betIdsKey, leaderboardKey);
  if (bets.length > 0) {
    pipeline.sadd(betIdsKey, ...bets.map((b) => b.externalBetId));
    pipeline.zadd(leaderboardKey, ...[...scores].flatMap(([playerId, score]) => [score, playerId]));
  }
  await pipeline.exec();

  console.log(
    `Rebuilt tournament ${tournamentId}: ${bets.length} bets, ${scores.size} players`,
  );

  await redis.quit();
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
