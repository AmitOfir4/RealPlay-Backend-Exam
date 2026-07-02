-- DropIndex
DROP INDEX "Bet_tournamentId_playerId_idx";

-- CreateIndex
CREATE INDEX "Bet_tournamentId_playerId_amount_idx" ON "Bet"("tournamentId", "playerId", "amount");
