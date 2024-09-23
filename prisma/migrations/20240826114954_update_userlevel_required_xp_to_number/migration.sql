-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "email" TEXT,
    "first_name" TEXT NOT NULL,
    "username" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "telegram_id" BIGINT NOT NULL,
    "profit" DOUBLE PRECISION DEFAULT 0,
    "coins" DOUBLE PRECISION DEFAULT 0,
    "banned" BOOLEAN DEFAULT false,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserLevel" (
    "id" SERIAL NOT NULL,
    "level" INTEGER NOT NULL,
    "required_xp" DOUBLE PRECISION NOT NULL,
    "profit_per_tap" INTEGER NOT NULL,
    "bonus_chance" INTEGER NOT NULL,
    "bonus_amount" INTEGER NOT NULL,
    "xp_growth" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "UserLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserLevelOnUser" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "levelId" INTEGER NOT NULL,
    "reachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserLevelOnUser_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_telegram_id_key" ON "User"("telegram_id");

-- CreateIndex
CREATE INDEX "user_level_user_idx" ON "UserLevelOnUser"("userId");

-- CreateIndex
CREATE INDEX "level_user_level_idx" ON "UserLevelOnUser"("levelId");

-- CreateIndex
CREATE UNIQUE INDEX "UserLevelOnUser_userId_levelId_key" ON "UserLevelOnUser"("userId", "levelId");

-- AddForeignKey
ALTER TABLE "UserLevelOnUser" ADD CONSTRAINT "UserLevelOnUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserLevelOnUser" ADD CONSTRAINT "UserLevelOnUser_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "UserLevel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
