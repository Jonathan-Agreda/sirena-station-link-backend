/*
  Warnings:

  - A unique constraint covering the columns `[telegramChatId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "public"."Urbanization" ADD COLUMN     "telegramGroupId" TEXT;

-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "telegramChatId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramChatId_key" ON "public"."User"("telegramChatId");
