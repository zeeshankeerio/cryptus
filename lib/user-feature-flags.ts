import { prisma } from "@/lib/prisma";
import { entitlementsCache } from "@/lib/entitlements-cache";

export type UserFeatureFlagName =
  | "allowAdvancedIndicators"
  | "allowAlerts"
  | "allowCustomSettings"
  | "maxRecords"
  | "maxSymbols";

export interface UserFeatureFlag {
  id: string;
  userId: string;
  flagName: string;
  flagValue: boolean | number;
  createdAt: Date;
  updatedAt: Date;
}

let tableEnsured = false;

async function ensureUserFeatureFlagTable(): Promise<void> {
  if (tableEnsured) return;

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "user_feature_flag" (
      "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
      "userId" TEXT NOT NULL,
      "flagName" TEXT NOT NULL,
      "flagValue" JSONB NOT NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT "user_feature_flag_userId_fkey" 
        FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE,
      CONSTRAINT "user_feature_flag_userId_flagName_key" 
        UNIQUE ("userId", "flagName")
    );
    
    CREATE INDEX IF NOT EXISTS "user_feature_flag_userId_idx" 
      ON "user_feature_flag"("userId");
    CREATE INDEX IF NOT EXISTS "user_feature_flag_flagName_idx" 
      ON "user_feature_flag"("flagName");
  `);

  tableEnsured = true;
}

export async function getUserFeatureFlags(
  userId: string
): Promise<Partial<Record<UserFeatureFlagName, boolean | number>>> {
  await ensureUserFeatureFlagTable();

  const flags = await prisma.$queryRawUnsafe<Array<{
    flagName: string;
    flagValue: boolean | number;
  }>>(
    `SELECT "flagName", "flagValue" FROM "user_feature_flag" WHERE "userId" = $1`,
    userId
  );

  return flags.reduce((acc, flag) => {
    acc[flag.flagName as UserFeatureFlagName] = flag.flagValue;
    return acc;
  }, {} as Partial<Record<UserFeatureFlagName, boolean | number>>);
}

export async function setUserFeatureFlag(
  userId: string,
  flagName: UserFeatureFlagName,
  flagValue: boolean | number
): Promise<UserFeatureFlag> {
  await ensureUserFeatureFlagTable();

  const result = await prisma.$queryRawUnsafe<UserFeatureFlag[]>(
    `
    INSERT INTO "user_feature_flag" ("userId", "flagName", "flagValue", "updatedAt")
    VALUES ($1, $2, $3::jsonb, NOW())
    ON CONFLICT ("userId", "flagName") 
    DO UPDATE SET 
      "flagValue" = EXCLUDED."flagValue",
      "updatedAt" = NOW()
    RETURNING *
    `,
    userId,
    flagName,
    JSON.stringify(flagValue)
  );

  // Invalidate entitlements cache for this user
  await invalidateUserEntitlementsCache(userId);

  return result[0];
}

export async function deleteUserFeatureFlag(
  userId: string,
  flagName: UserFeatureFlagName
): Promise<void> {
  await ensureUserFeatureFlagTable();

  await prisma.$executeRawUnsafe(
    `DELETE FROM "user_feature_flag" WHERE "userId" = $1 AND "flagName" = $2`,
    userId,
    flagName
  );

  // Invalidate entitlements cache for this user
  await invalidateUserEntitlementsCache(userId);
}

export async function getAllUserFeatureFlags(
  userId: string
): Promise<UserFeatureFlag[]> {
  await ensureUserFeatureFlagTable();

  return await prisma.$queryRawUnsafe<UserFeatureFlag[]>(
    `SELECT * FROM "user_feature_flag" WHERE "userId" = $1 ORDER BY "flagName"`,
    userId
  );
}

// Cache invalidation helper
async function invalidateUserEntitlementsCache(userId: string): Promise<void> {
  entitlementsCache.invalidate(userId);
  console.log(`[user-feature-flags] Invalidated cache for user ${userId}`);
}
