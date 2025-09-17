-- CreateTable
CREATE TABLE "public"."SirenState" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "online" BOOLEAN NOT NULL,
    "relay" "public"."SwitchState" NOT NULL,
    "ip" TEXT,
    "lastSeen" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SirenState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SirenState_deviceId_key" ON "public"."SirenState"("deviceId");

-- AddForeignKey
ALTER TABLE "public"."SirenState" ADD CONSTRAINT "SirenState_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "public"."Siren"("deviceId") ON DELETE CASCADE ON UPDATE CASCADE;
