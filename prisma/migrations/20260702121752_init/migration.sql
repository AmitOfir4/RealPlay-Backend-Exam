-- CreateEnum
CREATE TYPE "TournamentStatus" AS ENUM ('ACTIVE', 'FINALIZED');

-- CreateTable
CREATE TABLE "Tournament" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "TournamentStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tournament_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bet" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "externalBetId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentPlacement" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,

    CONSTRAINT "TournamentPlacement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Tournament_startsAt_endsAt_idx" ON "Tournament"("startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "Tournament_status_endsAt_idx" ON "Tournament"("status", "endsAt");

-- CreateIndex
CREATE INDEX "Bet_tournamentId_playerId_idx" ON "Bet"("tournamentId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "Bet_tournamentId_externalBetId_key" ON "Bet"("tournamentId", "externalBetId");

-- CreateIndex
CREATE INDEX "TournamentPlacement_tournamentId_rank_idx" ON "TournamentPlacement"("tournamentId", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentPlacement_tournamentId_playerId_key" ON "TournamentPlacement"("tournamentId", "playerId");

-- AddForeignKey
ALTER TABLE "Bet" ADD CONSTRAINT "Bet_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentPlacement" ADD CONSTRAINT "TournamentPlacement_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
