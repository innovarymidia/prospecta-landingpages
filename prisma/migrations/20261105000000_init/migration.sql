CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'READY', 'SENT', 'REPLIED', 'QUALIFIED', 'MEETING', 'WON', 'LOST', 'OPTED_OUT', 'BLOCKED');
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');
CREATE TYPE "MessageStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'FAILED');
CREATE TYPE "MessagePurpose" AS ENUM ('INITIAL', 'REPLY');

CREATE TABLE "Lead" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "company" TEXT,
  "website" TEXT,
  "address" TEXT,
  "category" TEXT,
  "providerId" TEXT,
  "source" TEXT,
  "notes" TEXT,
  "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
  "initialSentAt" TIMESTAMP(3),
  "lastMessageAt" TIMESTAMP(3),
  "optOutAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Lead_phone_key" ON "Lead"("phone");
CREATE UNIQUE INDEX "Lead_providerId_key" ON "Lead"("providerId");
CREATE INDEX "Lead_status_createdAt_idx" ON "Lead"("status", "createdAt");

CREATE TABLE "Message" (
  "id" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "direction" "MessageDirection" NOT NULL,
  "purpose" "MessagePurpose",
  "status" "MessageStatus" NOT NULL DEFAULT 'QUEUED',
  "body" TEXT NOT NULL,
  "externalId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Message_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Message_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Message_externalId_key" ON "Message"("externalId");
CREATE INDEX "Message_leadId_createdAt_idx" ON "Message"("leadId", "createdAt");

CREATE TABLE "Campaign" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "criteria" TEXT,
  "searchTerms" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "location" TEXT NOT NULL DEFAULT '',
  "regionCode" TEXT,
  "language" TEXT NOT NULL DEFAULT 'pt',
  "maxResults" INTEGER NOT NULL DEFAULT 25,
  "websiteTarget" TEXT NOT NULL DEFAULT 'any',
  "intervalHours" INTEGER NOT NULL DEFAULT 24,
  "lastSearchedAt" TIMESTAMP(3),
  "lastSearchRequestedAt" TIMESTAMP(3),
  "lastSearchStatus" TEXT,
  "lastSearchCount" INTEGER NOT NULL DEFAULT 0,
  "lastSearchAdded" INTEGER NOT NULL DEFAULT 0,
  "lastSearchError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SearchRun" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RUNNING',
  "termsCount" INTEGER NOT NULL DEFAULT 0,
  "found" INTEGER NOT NULL DEFAULT 0,
  "added" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  CONSTRAINT "SearchRun_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SearchRun_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "SearchRun_campaignId_startedAt_idx" ON "SearchRun"("campaignId", "startedAt");

CREATE TABLE "Suppression" (
  "phone" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Suppression_pkey" PRIMARY KEY ("phone")
);
