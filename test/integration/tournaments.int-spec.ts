import { INestApplicationContext, ValidationPipe } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import Redis from 'ioredis';
import { AppModule } from '../../apps/api/src/app.module';
import { WorkersModule } from '../../apps/workers/src/workers.module';
import { PrismaService } from '../../libs/shared/src/prisma/prisma.service';

// Requires docker compose services (postgres + redis) to be running.
describe('Tournaments (integration)', () => {
  let app: NestFastifyApplication;
  let workers: INestApplicationContext | null = null;
  let prisma: PrismaService;
  let redis: Redis;

  const now = Date.now();
  const iso = (offsetMs: number) => new Date(now + offsetMs).toISOString();
  const HOUR = 60 * 60 * 1000;

  const post = async (url: string, payload: object) => {
    const res = await app.inject({ method: 'POST', url, payload });
    return { status: res.statusCode, body: res.json() };
  };
  const get = async (url: string) => {
    const res = await app.inject({ method: 'GET', url });
    return { status: res.statusCode, body: res.json() };
  };

  beforeAll(async () => {
    redis = new Redis({
      host: process.env.REDIS_HOST ?? 'localhost',
      port: Number(process.env.REDIS_PORT ?? 6379),
    });
    await redis.flushdb();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    prisma = app.get(PrismaService);
    await prisma.tournamentPlacement.deleteMany();
    await prisma.bet.deleteMany();
    await prisma.tournament.deleteMany();
  });

  afterAll(async () => {
    await app.close();
    if (workers) await workers.close();
    await redis.quit();
  });

  it('creates tournaments and validates the window', async () => {
    const bad = await post('/tournaments', {
      name: 'Backwards',
      startsAt: iso(HOUR),
      endsAt: iso(-HOUR),
    });
    expect(bad.status).toBe(400);

    const ok = await post('/tournaments', {
      name: 'Weekly',
      startsAt: iso(-HOUR),
      endsAt: iso(HOUR),
    });
    expect(ok.status).toBe(201);
    expect(ok.body.status).toBe('ACTIVE');
  });

  it('ingests bets into every overlapping tournament, idempotently', async () => {
    const a = (
      await post('/tournaments', { name: 'A', startsAt: iso(-HOUR), endsAt: iso(HOUR) })
    ).body;
    const b = (
      await post('/tournaments', { name: 'B', startsAt: iso(-2 * HOUR), endsAt: iso(2 * HOUR) })
    ).body;

    const bet = (over: object = {}) => ({
      externalBetId: 'bet_1',
      playerId: 'p1',
      amount: 250,
      currency: 'USD',
      createdAt: iso(0),
      ...over,
    });

    const first = await post('/bet', bet());
    expect(first.status).toBe(200);
    const forA = first.body.results.find((r: any) => r.tournamentId === a.id);
    const forB = first.body.results.find((r: any) => r.tournamentId === b.id);
    expect(forA).toEqual({ tournamentId: a.id, accepted: true, duplicate: false });
    expect(forB).toEqual({ tournamentId: b.id, accepted: true, duplicate: false });

    const dup = await post('/bet', bet());
    expect(dup.status).toBe(200);
    expect(dup.body.results.every((r: any) => r.duplicate)).toBe(true);

    // bet_3 is older, so it only fits B's wider window
    await post('/bet', bet({ externalBetId: 'bet_2', playerId: 'p2', amount: 500 }));
    await post('/bet', bet({ externalBetId: 'bet_3', playerId: 'p1', amount: 100, createdAt: iso(-1.5 * HOUR) }));

    const lbA = (await get(`/tournaments/${a.id}/leaderboard`)).body;
    expect(lbA.source).toBe('live');
    expect(lbA.total).toBe(2);
    expect(lbA.entries).toEqual([
      { rank: 1, playerId: 'p2', score: 500 },
      { rank: 2, playerId: 'p1', score: 250 },
    ]);

    const lbB = (await get(`/tournaments/${b.id}/leaderboard`)).body;
    expect(lbB.entries).toEqual([
      { rank: 1, playerId: 'p2', score: 500 },
      { rank: 2, playerId: 'p1', score: 350 },
    ]);

    const page2 = (await get(`/tournaments/${a.id}/leaderboard?limit=1&offset=1`)).body;
    expect(page2.entries).toEqual([{ rank: 2, playerId: 'p1', score: 250 }]);
  });

  it('acknowledges bets that match no tournament without counting them', async () => {
    const res = await post('/bet', {
      externalBetId: 'bet_stray',
      playerId: 'p9',
      amount: 100,
      currency: 'USD',
      createdAt: iso(-100 * HOUR),
    });
    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([]);
  });

  it('rejects malformed bets', async () => {
    const res = await post('/bet', {
      externalBetId: 'bet_bad',
      playerId: 'p1',
      amount: 2.5, // not integer cents
      currency: 'USD',
      createdAt: iso(0),
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown tournament leaderboard', async () => {
    const res = await get('/tournaments/00000000-0000-0000-0000-000000000000/leaderboard');
    expect(res.status).toBe(404);
  });

  it('finalizes an ended tournament through the worker and serves final placements', async () => {
    const ended = (
      await post('/tournaments', { name: 'Ended', startsAt: iso(-2 * HOUR), endsAt: iso(-60_000) })
    ).body;

    const bet = (externalBetId: string, playerId: string, amount: number) =>
      post('/bet', { externalBetId, playerId, amount, currency: 'USD', createdAt: iso(-HOUR) });

    // p1 and p2 tie at 300
    await bet('bet_f1', 'p1', 150);
    await bet('bet_f2', 'p1', 150);
    await bet('bet_f3', 'p2', 300);
    await bet('bet_f4', 'p3', 100);

    const workerRef = await Test.createTestingModule({ imports: [WorkersModule] }).compile();
    workers = await workerRef.init();

    // wait for the BullMQ worker to process the finalize job
    let body: any;
    for (let i = 0; i < 60; i++) {
      body = (await get(`/tournaments/${ended.id}/leaderboard`)).body;
      if (body.source === 'final') break;
      await new Promise((r) => setTimeout(r, 500));
    }

    expect(body.source).toBe('final');
    expect(body.entries).toEqual([
      { rank: 1, playerId: 'p1', score: 300 },
      { rank: 1, playerId: 'p2', score: 300 },
      { rank: 3, playerId: 'p3', score: 100 },
    ]);

    const stored = await prisma.tournament.findUnique({ where: { id: ended.id } });
    expect(stored?.status).toBe('FINALIZED');
  });
});
