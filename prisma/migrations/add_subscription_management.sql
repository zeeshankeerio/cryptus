-- Add subscription table for Better Auth Stripe + manual renew support
CREATE TABLE IF NOT EXISTS "subscription" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "referenceId" TEXT NOT NULL,
  "stripeCustomerId" TEXT,
  "stripeSubscriptionId" TEXT,
  "status" TEXT NOT NULL,
  "plan" TEXT NOT NULL,
  "billingInterval" TEXT,
  "periodStart" TIMESTAMP,
  "periodEnd" TIMESTAMP,
  "trialStart" TIMESTAMP,
  "trialEnd" TIMESTAMP,
  "cancelAtPeriodEnd" BOOLEAN DEFAULT false,
  "canceledAt" TIMESTAMP,
  "cancelAt" TIMESTAMP,
  "endedAt" TIMESTAMP,
  "seats" INTEGER,
  "invoiceRef" TEXT,
  "renewalNotes" TEXT,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "subscription_userId_idx" ON "subscription"("userId");
CREATE INDEX IF NOT EXISTS "subscription_referenceId_idx" ON "subscription"("referenceId");
CREATE INDEX IF NOT EXISTS "subscription_status_idx" ON "subscription"("status");
