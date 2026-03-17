CREATE TYPE "MeetingProvider" AS ENUM ('zoom', 'teams');

ALTER TABLE "Meeting"
ADD COLUMN "provider" "MeetingProvider",
ADD COLUMN "externalMeetingId" TEXT,
ADD COLUMN "externalRecordId" TEXT,
ADD COLUMN "externalUrl" TEXT,
ADD COLUMN "organizerEmail" TEXT;

CREATE UNIQUE INDEX "Meeting_provider_externalMeetingId_key"
ON "Meeting"("provider", "externalMeetingId");

CREATE TABLE "MeetingProviderConnection" (
  "id" TEXT NOT NULL,
  "provider" "MeetingProvider" NOT NULL,
  "userId" TEXT NOT NULL,
  "accessToken" TEXT NOT NULL,
  "refreshToken" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "scope" TEXT,
  "externalUserId" TEXT,
  "externalEmail" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MeetingProviderConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MeetingProviderConnection_provider_userId_key"
ON "MeetingProviderConnection"("provider", "userId");

ALTER TABLE "MeetingProviderConnection"
ADD CONSTRAINT "MeetingProviderConnection_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
