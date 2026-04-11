import { prisma } from "@/lib/prisma";

export interface FeatureFlags {
  maxTrialRecords: number;
  maxSubscribedRecords: number;
  allowTrialAlerts: boolean;
  allowTrialAdvancedIndicators: boolean;
  allowTrialCustomSettings: boolean;
}

const DEFAULT_FLAGS: FeatureFlags = {
  maxTrialRecords: 100,
  maxSubscribedRecords: 500,
  allowTrialAlerts: false,
  allowTrialAdvancedIndicators: false,
  allowTrialCustomSettings: false,
};

let tableEnsured = false;

async function ensureFeatureFlagsTable(): Promise<void> {
  if (tableEnsured) return;

  await prisma.$executeRawUnsafe(`
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
  `);

  tableEnsured = true;
}

type FeatureFlagRow = {
  id: string;
  maxTrialRecords: number;
  maxSubscribedRecords: number;
  allowTrialAlerts: boolean;
  allowTrialAdvancedIndicators: boolean;
  allowTrialCustomSettings: boolean;
};

function sanitizeFlags(flags: Partial<FeatureFlags>): FeatureFlags {
  const maxTrialRecords = Math.min(Math.max(Number(flags.maxTrialRecords ?? DEFAULT_FLAGS.maxTrialRecords), 50), 500);
  const maxSubscribedRecords = Math.min(Math.max(Number(flags.maxSubscribedRecords ?? DEFAULT_FLAGS.maxSubscribedRecords), 100), 1000);

  return {
    maxTrialRecords,
    maxSubscribedRecords,
    allowTrialAlerts: Boolean(flags.allowTrialAlerts ?? DEFAULT_FLAGS.allowTrialAlerts),
    allowTrialAdvancedIndicators: Boolean(
      flags.allowTrialAdvancedIndicators ?? DEFAULT_FLAGS.allowTrialAdvancedIndicators,
    ),
    allowTrialCustomSettings: Boolean(
      flags.allowTrialCustomSettings ?? DEFAULT_FLAGS.allowTrialCustomSettings,
    ),
  };
}

function rowToFlags(row: FeatureFlagRow | null | undefined): FeatureFlags {
  if (!row) return DEFAULT_FLAGS;

  return sanitizeFlags({
    maxTrialRecords: row.maxTrialRecords,
    maxSubscribedRecords: row.maxSubscribedRecords,
    allowTrialAlerts: row.allowTrialAlerts,
    allowTrialAdvancedIndicators: row.allowTrialAdvancedIndicators,
    allowTrialCustomSettings: row.allowTrialCustomSettings,
  });
}

export async function getFeatureFlags(): Promise<FeatureFlags> {
  await ensureFeatureFlagsTable();

  const rows = await prisma.$queryRawUnsafe<FeatureFlagRow[]>(
    `SELECT * FROM "feature_flag" WHERE "id" = 'global' LIMIT 1;`,
  );

  const existing = rowToFlags(rows[0]);

  if (rows.length > 0) {
    return existing;
  }

  const inserted = await prisma.$queryRawUnsafe<FeatureFlagRow[]>(
    `
      INSERT INTO "feature_flag" (
        "id",
        "maxTrialRecords",
        "maxSubscribedRecords",
        "allowTrialAlerts",
        "allowTrialAdvancedIndicators",
        "allowTrialCustomSettings"
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT ("id") DO UPDATE SET
        "updatedAt" = NOW()
      RETURNING *;
    `,
    "global",
    DEFAULT_FLAGS.maxTrialRecords,
    DEFAULT_FLAGS.maxSubscribedRecords,
    DEFAULT_FLAGS.allowTrialAlerts,
    DEFAULT_FLAGS.allowTrialAdvancedIndicators,
    DEFAULT_FLAGS.allowTrialCustomSettings,
  );

  return rowToFlags(inserted[0]);
}

export async function updateFeatureFlags(partial: Partial<FeatureFlags>): Promise<FeatureFlags> {
  const current = await getFeatureFlags();
  const next = sanitizeFlags({ ...current, ...partial });

  const rows = await prisma.$queryRawUnsafe<FeatureFlagRow[]>(
    `
      INSERT INTO "feature_flag" (
        "id",
        "maxTrialRecords",
        "maxSubscribedRecords",
        "allowTrialAlerts",
        "allowTrialAdvancedIndicators",
        "allowTrialCustomSettings"
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT ("id") DO UPDATE SET
        "maxTrialRecords" = EXCLUDED."maxTrialRecords",
        "maxSubscribedRecords" = EXCLUDED."maxSubscribedRecords",
        "allowTrialAlerts" = EXCLUDED."allowTrialAlerts",
        "allowTrialAdvancedIndicators" = EXCLUDED."allowTrialAdvancedIndicators",
        "allowTrialCustomSettings" = EXCLUDED."allowTrialCustomSettings",
        "updatedAt" = NOW()
      RETURNING *;
    `,
    "global",
    next.maxTrialRecords,
    next.maxSubscribedRecords,
    next.allowTrialAlerts,
    next.allowTrialAdvancedIndicators,
    next.allowTrialCustomSettings,
  );

  return rowToFlags(rows[0]);
}
