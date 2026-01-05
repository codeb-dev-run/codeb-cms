-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('BINARY', 'ODD_EVEN', 'MULTI_CHOICE', 'PREDICTION');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('UPCOMING', 'OPEN', 'CLOSED', 'SETTLED', 'CANCELLED');

-- CreateTable
CREATE TABLE "participation_events" (
    "id" TEXT NOT NULL,
    "type" "EventType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "EventStatus" NOT NULL DEFAULT 'UPCOMING',
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "options" JSONB NOT NULL,
    "correct_answer" TEXT,
    "result_at" TIMESTAMP(3),
    "point_cost" INTEGER NOT NULL DEFAULT 0,
    "reward_pool" INTEGER NOT NULL DEFAULT 0,
    "reward_multiplier" DOUBLE PRECISION NOT NULL DEFAULT 2.0,
    "total_participants" INTEGER NOT NULL DEFAULT 0,
    "image_url" TEXT,
    "is_published" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "participation_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participations" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "choice" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "is_winner" BOOLEAN,
    "reward" INTEGER,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "participations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_points" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "lifetime" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "max_streak" INTEGER NOT NULL DEFAULT 0,
    "last_check_in" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "point_transactions" (
    "id" TEXT NOT NULL,
    "user_point_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "balance" INTEGER NOT NULL,
    "event_id" TEXT,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "point_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leaderboard_entries" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "win_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leaderboard_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "participation_events_status_idx" ON "participation_events"("status");

-- CreateIndex
CREATE INDEX "participation_events_type_idx" ON "participation_events"("type");

-- CreateIndex
CREATE INDEX "participation_events_starts_at_idx" ON "participation_events"("starts_at");

-- CreateIndex
CREATE INDEX "participation_events_ends_at_idx" ON "participation_events"("ends_at");

-- CreateIndex
CREATE INDEX "participations_event_id_idx" ON "participations"("event_id");

-- CreateIndex
CREATE INDEX "participations_user_id_idx" ON "participations"("user_id");

-- CreateIndex
CREATE INDEX "participations_created_at_idx" ON "participations"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "participations_event_id_user_id_key" ON "participations"("event_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_points_user_id_key" ON "user_points"("user_id");

-- CreateIndex
CREATE INDEX "user_points_balance_idx" ON "user_points"("balance");

-- CreateIndex
CREATE INDEX "user_points_lifetime_idx" ON "user_points"("lifetime");

-- CreateIndex
CREATE INDEX "point_transactions_user_point_id_idx" ON "point_transactions"("user_point_id");

-- CreateIndex
CREATE INDEX "point_transactions_type_idx" ON "point_transactions"("type");

-- CreateIndex
CREATE INDEX "point_transactions_created_at_idx" ON "point_transactions"("created_at");

-- CreateIndex
CREATE INDEX "leaderboard_entries_period_points_idx" ON "leaderboard_entries"("period", "points" DESC);

-- CreateIndex
CREATE INDEX "leaderboard_entries_period_rank_idx" ON "leaderboard_entries"("period", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "leaderboard_entries_user_id_period_key" ON "leaderboard_entries"("user_id", "period");

-- AddForeignKey
ALTER TABLE "participations" ADD CONSTRAINT "participations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "participation_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participations" ADD CONSTRAINT "participations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_points" ADD CONSTRAINT "user_points_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_user_point_id_fkey" FOREIGN KEY ("user_point_id") REFERENCES "user_points"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leaderboard_entries" ADD CONSTRAINT "leaderboard_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
