-- CreateEnum
CREATE TYPE "public"."Role" AS ENUM ('SUPERADMIN', 'ADMIN', 'GUARDIA', 'RESIDENTE');

-- CreateEnum
CREATE TYPE "public"."SwitchState" AS ENUM ('ON', 'OFF');

-- CreateEnum
CREATE TYPE "public"."ActivationAction" AS ENUM ('ON', 'OFF', 'AUTO_OFF');

-- CreateEnum
CREATE TYPE "public"."ActivationResult" AS ENUM ('ACCEPTED', 'REJECTED', 'FAILED');

-- CreateTable
CREATE TABLE "public"."Urbanization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "maxUsers" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Urbanization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "keycloakId" TEXT,
    "email" TEXT NOT NULL,
    "username" TEXT,
    "role" "public"."Role" NOT NULL,
    "etapa" TEXT,
    "manzana" TEXT,
    "villa" TEXT,
    "alicuota" BOOLEAN NOT NULL DEFAULT true,
    "urbanizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Siren" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "ip" TEXT,
    "online" BOOLEAN NOT NULL DEFAULT false,
    "relay" "public"."SwitchState" NOT NULL DEFAULT 'OFF',
    "sirenState" "public"."SwitchState" NOT NULL DEFAULT 'OFF',
    "lastSeen" TIMESTAMP(3),
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "urbanizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Siren_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Group" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "urbanizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GroupMember" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "sirenId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Assignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sirenId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ActivationLog" (
    "id" TEXT NOT NULL,
    "sirenId" TEXT NOT NULL,
    "userId" TEXT,
    "action" "public"."ActivationAction" NOT NULL,
    "result" "public"."ActivationResult" NOT NULL,
    "reason" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "keycloakSessionId" TEXT NOT NULL,
    "userAgent" TEXT,
    "device" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Urbanization_name_key" ON "public"."Urbanization"("name");

-- CreateIndex
CREATE UNIQUE INDEX "User_keycloakId_key" ON "public"."User"("keycloakId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "public"."User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Siren_deviceId_key" ON "public"."Siren"("deviceId");

-- CreateIndex
CREATE INDEX "Siren_urbanizationId_idx" ON "public"."Siren"("urbanizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Group_urbanizationId_name_key" ON "public"."Group"("urbanizationId", "name");

-- CreateIndex
CREATE INDEX "GroupMember_sirenId_idx" ON "public"."GroupMember"("sirenId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupMember_groupId_sirenId_key" ON "public"."GroupMember"("groupId", "sirenId");

-- CreateIndex
CREATE INDEX "Assignment_sirenId_idx" ON "public"."Assignment"("sirenId");

-- CreateIndex
CREATE UNIQUE INDEX "Assignment_userId_sirenId_key" ON "public"."Assignment"("userId", "sirenId");

-- CreateIndex
CREATE INDEX "ActivationLog_sirenId_idx" ON "public"."ActivationLog"("sirenId");

-- CreateIndex
CREATE INDEX "ActivationLog_userId_idx" ON "public"."ActivationLog"("userId");

-- CreateIndex
CREATE INDEX "ActivationLog_createdAt_idx" ON "public"."ActivationLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserSession_keycloakSessionId_key" ON "public"."UserSession"("keycloakSessionId");

-- CreateIndex
CREATE INDEX "UserSession_userId_active_idx" ON "public"."UserSession"("userId", "active");

-- AddForeignKey
ALTER TABLE "public"."User" ADD CONSTRAINT "User_urbanizationId_fkey" FOREIGN KEY ("urbanizationId") REFERENCES "public"."Urbanization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Siren" ADD CONSTRAINT "Siren_urbanizationId_fkey" FOREIGN KEY ("urbanizationId") REFERENCES "public"."Urbanization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Group" ADD CONSTRAINT "Group_urbanizationId_fkey" FOREIGN KEY ("urbanizationId") REFERENCES "public"."Urbanization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GroupMember" ADD CONSTRAINT "GroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "public"."Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GroupMember" ADD CONSTRAINT "GroupMember_sirenId_fkey" FOREIGN KEY ("sirenId") REFERENCES "public"."Siren"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Assignment" ADD CONSTRAINT "Assignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Assignment" ADD CONSTRAINT "Assignment_sirenId_fkey" FOREIGN KEY ("sirenId") REFERENCES "public"."Siren"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ActivationLog" ADD CONSTRAINT "ActivationLog_sirenId_fkey" FOREIGN KEY ("sirenId") REFERENCES "public"."Siren"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ActivationLog" ADD CONSTRAINT "ActivationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserSession" ADD CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
