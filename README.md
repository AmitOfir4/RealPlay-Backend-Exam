# RealPlay — Tournaments Module

A small NestJS (Fastify) service that creates tournaments, ingests bet events, exposes a live Redis-backed leaderboard, and writes final placements to Postgres after a tournament ends.

## Stack

- **NestJS 11 + Fastify** — HTTP API (`apps/api`)
- **Separate workers app** (`apps/workers`) — BullMQ processor that finalizes tournaments
- **Postgres + Prisma** — durable storage (tournaments, accepted bets, final placements)
- **Redis** — live ranking (ZSET) + per-tournament idempotency guard (SET)
- **BullMQ** — delayed snapshot job per tournament + a repeatable sweeper as a safety net
- **Swagger / OpenAPI** — interactive API docs at `/docs`

## Quick start

```bash
cp .env.example .env        # defaults work with the compose file
npm install
docker compose up -d        # postgres :5432, redis :6379
npx prisma migrate deploy   # apply migrations
npx prisma generate

# run both apps (two terminals, or background one)
npm run dev:api             # http://localhost:3000
npm run dev:workers
```

Production-style: `npm run build`, then `npm run start:api` / `npm run start:workers`.

### Interactive API docs

Once the API is running, open **http://localhost:3000/docs** — a Swagger UI with every
endpoint, request/response schemas, and payload examples. Use **"Try it out"** to exercise
the API from the browser without curl. (Set `SWAGGER=off` to disable in production.)

### Try it

```bash
# create a tournament
curl -s -X POST localhost:3000/tournaments -H 'content-type: application/json' \
  -d '{"name":"Weekly Cup","startsAt":"2026-07-02T00:00:00.000Z","endsAt":"2026-07-02T23:59:00.000Z"}'

# ingest a bet (idempotent — replay it and score won't change)
curl -s -X POST localhost:3000/bet -H 'content-type: application/json' \
  -d '{"externalBetId":"bet_123456","playerId":"player_42","amount":250,"currency":"USD","createdAt":"2026-07-02T12:30:00.000Z"}'

# live leaderboard
curl -s 'localhost:3000/tournaments/<id>/leaderboard?limit=20&offset=0'
```

## Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/tournaments` | Create a tournament (`name`, `startsAt`, `endsAt`). Schedules the finalize job. |
| `GET` | `/tournaments?limit&offset` | Paginated list of ACTIVE (not yet finalized) tournaments, newest first. |
| `POST` | `/bet` | Ingest a bet event. Counts towards **every** ACTIVE tournament whose window contains `createdAt`. Always 200; duplicates are flagged, never errors. |
| `GET` | `/tournaments/:id/leaderboard?limit&offset` | Paginated placements, score DESC. Served from Redis while live, from Postgres after finalization (`source` field tells you which). |

`POST /bet` response shape:

```json
{
  "externalBetId": "bet_123456",
  "results": [
    { "tournamentId": "…", "accepted": true,  "duplicate": false },
    { "tournamentId": "…", "accepted": false, "duplicate": true }
  ]
}
```

## Design

### Write path & idempotency

Each bet touches two stores, so the order and the failure window between them are defined explicitly:

1. **Postgres first.** `Bet` insert with a unique `(tournamentId, externalBetId)` constraint (`createMany … skipDuplicates`) is the *durable decision* of whether the bet counts.
2. **Redis second.** A Lua script atomically does `SADD betIds` → only-if-new `ZINCRBY leaderboard`. One pipelined round trip covers all matching tournaments.

Both steps are independently idempotent, so a crash between them self-heals: the retry finds the Postgres row already there (skipped) and the Lua guard either applies the score once or confirms it was applied. Concurrent duplicates can't double-count because the check-and-increment is a single atomic script.

Redis is therefore a **derived view** of the `Bet` table. If Redis is flushed mid-tournament, `npm run rebuild:leaderboard -- <tournamentId>` reconstructs the live state from Postgres.

### Finalization

- Creating a tournament enqueues a **delayed BullMQ job** that fires at `endsAt` + 5s grace (absorbs slightly-late events and clock skew).
- The processor snapshots the ZSET, computes **competition ranking** ("1224": ties share a rank), and in one transaction rewrites placements + flips status to `FINALIZED`. Fully idempotent — safe to retry or double-run.
- **Late bets:** ingestion only matches `ACTIVE` tournaments, so once placements are written the leaderboard can never silently diverge from them. A bet arriving after finalization simply doesn't count towards that tournament.
- **Lost-job safety net:** a repeatable **sweeper** job (every 60s) finds tournaments with `endsAt < now` still `ACTIVE` and re-enqueues finalization. Deterministic job IDs (`finalize-<tournamentId>`) prevent double-scheduling; the processor's status check makes a race harmless anyway. So finalization survives a Redis flush or a worker that was down at fire time.

### Leaderboard reads

- Live: `ZRANGE … REV WITHSCORES` + `ZCARD`, rank = offset + position + 1.
- Finalized: `TournamentPlacement` rows ordered by rank.
- Tie ranks: the *final* snapshot uses competition ranking with `playerId` as a deterministic tie-break; the *live* view shows positional ranks (a ZSET has a total order). Documented rather than hidden.

## Assumptions & tradeoffs

- **Currency is recorded, not converted.** Scores sum raw cent amounts; a real system would either reject mixed currencies or normalize before scoring.
- **`amount` must be a positive integer** (cents). Refunds/cancellations are out of scope.
- **Scores fit in a 32-bit int** (~$21M in cents per player per tournament). Would be `BigInt` in production.
- **Bets are persisted per tournament** (not globally) — slightly more rows, but it makes the unique constraint express exactly the business rule ("once per tournament") and keeps rebuilds trivial.
- **Every accepted bet is written to Postgres on the hot path.** Strictly, the spec only needs Redis until the snapshot; the durable write buys idempotency-after-Redis-loss and auditability at the cost of one insert per request. At higher throughput I'd move this behind a queue and ingest asynchronously.
- **No auth/rate limiting** — out of scope for the exercise. Every endpoint is open, so
  e.g. `GET /tournaments` lets anyone enumerate tournaments; in production this would sit
  behind auth and per-client rate limits.
- **Offset pagination.** List endpoints use `limit`/`offset` (capped at 100), backed by a
  `(status, createdAt)` index so listing active tournaments is index-ordered with no sort
  step. Offset paging is simple and standard but scans+discards `offset` rows, so very deep
  pages get progressively slower; at large scale I'd switch to keyset/cursor pagination
  (`WHERE createdAt < :lastSeen`), which is O(1) per page. `total` is returned via `COUNT`,
  which is cheap here but would become an estimate on a very large table.
- Tournament windows may be created in the past (useful for testing); such tournaments finalize almost immediately.

## Tests

```bash
npm test        # unit — no infra needed (14 tests)
npm run test:int  # integration — needs docker compose up -d (6 tests)
```

> **Note:** stop any running `npm run dev:workers` before `npm run test:int` — both share the
> same Redis/BullMQ queue, so a second worker can race the suite's own worker and cause a
> spurious finalization failure.

- **Unit:** ingestion rules (window matching, multi-tournament fan-out, duplicate handling), leaderboard rank math and live/final switching, competition-ranking edge cases.
- **Integration** (real Postgres + Redis): end-to-end bet ingestion, duplicate replay, leaderboard ordering and pagination, validation failures, and finalization through the real BullMQ worker including tie ranking.

## Project layout

```
apps/
  api/        # HTTP app: tournaments + bets controllers/services
  workers/    # BullMQ processor: finalize + sweeper
libs/
  shared/     # PrismaService, Redis provider, LeaderboardStore (Lua), queue constants
prisma/       # schema + migrations
scripts/      # rebuild-leaderboard.ts (rebuild Redis from Postgres)
test/         # integration suite
```
