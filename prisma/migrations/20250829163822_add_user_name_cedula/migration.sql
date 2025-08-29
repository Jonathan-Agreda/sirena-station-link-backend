/*
  Warnings:

  - A unique constraint covering the columns `[cedula]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "cedula" VARCHAR(32),
ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "lastName" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_cedula_key" ON "public"."User"("cedula");
