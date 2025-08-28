/*
  Warnings:

  - You are about to drop the `GroupMember` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."GroupMember" DROP CONSTRAINT "GroupMember_groupId_fkey";

-- DropForeignKey
ALTER TABLE "public"."GroupMember" DROP CONSTRAINT "GroupMember_sirenId_fkey";

-- AlterTable
ALTER TABLE "public"."Siren" ADD COLUMN     "groupId" TEXT;

-- DropTable
DROP TABLE "public"."GroupMember";

-- CreateIndex
CREATE INDEX "Siren_groupId_idx" ON "public"."Siren"("groupId");

-- AddForeignKey
ALTER TABLE "public"."Siren" ADD CONSTRAINT "Siren_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "public"."Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;
