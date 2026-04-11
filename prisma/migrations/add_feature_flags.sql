-- Singleton feature flag table for owner-controlled SaaS rollout gating
CREATE TABLE IF NOT EXISTS "feature_flag" (
  "id" TEXT PRIMARY KEY,
  "maxTrialRecords" INTEGER NOT NULL DEFAULT 100,
  "maxSubscribedRecords" INTEGER NOT NULL DEFAULT 500,
  "allowTrialAlerts" BOOLEAN NOT NULL DEFAULT false,
  "allowTrialAdvancedIndicators" BOOLEAN NOT NULL DEFAULT false,
  "allowTrialCustomSettings" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO "feature_flag" (
  "id",
  "maxTrialRecords",
  "maxSubscribedRecords",
  "allowTrialAlerts",
  "allowTrialAdvancedIndicators",
  "allowTrialCustomSettings"
)
VALUES ('global', 100, 500, false, false, false)
ON CONFLICT ("id") DO NOTHING;
