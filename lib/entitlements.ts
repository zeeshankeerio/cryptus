import { AUTH_CONFIG } from "@/lib/config";
import { getFeatureFlags, type FeatureFlags } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";
import { getUserFeatureFlags, type UserFeatureFlagName } from "@/lib/user-feature-flags";
import { entitlementsCache } from "@/lib/entitlements-cache";

const RECORD_OPTIONS = [100, 200, 300, 500] as const;

type EntitlementUser = {
  id: string;
  email: string;
  role: string | null;
  createdAt: Date;
  coins?: number;
};

export type EntitlementTier = "owner" | "subscribed" | "trial" | "free" | "anonymous";

export interface ResolvedEntitlements {
  tier: EntitlementTier;
  isOwner: boolean;
  hasPaidAccess: boolean;
  isTrialing: boolean;
  maxRecords: number;
  availableRecordOptions: number[];
  features: {
    enableAlerts: boolean;
    enableAdvancedIndicators: boolean;
    enableCustomSettings: boolean;
  };
  coins: number;
  maxSymbols: number;
  flags: FeatureFlags;
  userFlags?: Partial<Record<UserFeatureFlagName, boolean | number>>;
}

type SubscriptionLite = {
  status: string;
  periodEnd: Date | null;
  trialEnd: Date | null;
  endedAt: Date | null;
};

function isOwnerUser(user: EntitlementUser | null): boolean {
  if (!user) return false;
  return user.email === AUTH_CONFIG.SUPER_ADMIN_EMAIL || user.role === "owner";
}

function getBestSubscription(subscriptions: SubscriptionLite[]): SubscriptionLite | null {
  const statusPriority: Record<string, number> = {
    active: 0,
    trialing: 1,
    past_due: 2,
  };

  if (subscriptions.length === 0) return null;

  return subscriptions
    .slice()
    .sort((a, b) => (statusPriority[a.status] ?? 99) - (statusPriority[b.status] ?? 99))[0];
}

function deriveOptions(maxRecords: number): number[] {
  const options = RECORD_OPTIONS.filter((count) => count <= maxRecords);
  if (options.length > 0) return options;
  return [Math.min(maxRecords, 100)];
}

export async function resolveEntitlementsForUser(user: EntitlementUser | null): Promise<ResolvedEntitlements> {
  // Check cache first
  if (user) {
    const cached = entitlementsCache.get(user.id);
    if (cached) {
      return cached;
    }
  }

  let flags: FeatureFlags;
  try {
    flags = await getFeatureFlags();
  } catch (error) {
    console.error("[entitlements] Failed to fetch feature flags, falling back to defaults:", error);
    // Explicit fallback to ensure system health during DB transitions
    flags = {
      maxTrialRecords: 100,
      maxSubscribedRecords: 500,
      allowTrialAlerts: false,
      allowTrialAdvancedIndicators: false,
      allowTrialCustomSettings: false,
    };
  }

  if (!user) {
    const maxRecords = Math.min(flags.maxTrialRecords, 100);
    const entitlements: ResolvedEntitlements = {
      tier: "anonymous",
      isOwner: false,
      hasPaidAccess: false,
      isTrialing: false,
      maxRecords,
      availableRecordOptions: deriveOptions(maxRecords),
      features: {
        enableAlerts: false,
        enableAdvancedIndicators: false,
        enableCustomSettings: false,
      },
      coins: 0,
      maxSymbols: 10, // Minimal for anonymous
      flags,
    };
    return entitlements;
  }

  if (isOwnerUser(user)) {
    const maxRecords = Math.max(flags.maxSubscribedRecords, 500);
    const entitlements: ResolvedEntitlements = {
      tier: "owner",
      isOwner: true,
      hasPaidAccess: true,
      isTrialing: false,
      maxRecords,
      availableRecordOptions: deriveOptions(maxRecords),
      features: {
        enableAlerts: true,
        enableAdvancedIndicators: true,
        enableCustomSettings: true,
      },
      coins: user.coins ?? 999999,
      maxSymbols: 1000,
      flags,
    };
    // Cache and return
    entitlementsCache.set(user.id, entitlements);
    console.log('[entitlements] Owner user detected - all features enabled:', {
      email: user.email,
      maxRecords,
      maxSymbols: 1000,
      features: entitlements.features
    });
    return entitlements;
  }

  let subscriptions: SubscriptionLite[] = [];
  try {
    subscriptions = await prisma.subscription.findMany({
      where: { referenceId: user.id },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: {
        status: true,
        periodEnd: true,
        trialEnd: true,
        endedAt: true,
      },
    });
  } catch (error: any) {
    if (error?.code !== "P2021") throw error;
    // Subscription table not migrated yet: fall back to trial/free behavior.
    subscriptions = [];
  }

  const best = getBestSubscription(subscriptions);
  const now = Date.now();

  let hasPaidAccess = false;
  let isTrialing = false;

  if (best) {
    const periodEndMs = best.periodEnd ? new Date(best.periodEnd).getTime() : null;
    const explicitTrialEndMs = best.trialEnd ? new Date(best.trialEnd).getTime() : null;
    const fallbackTrialEndMs = user.createdAt.getTime() + AUTH_CONFIG.TRIAL_DAYS * 24 * 60 * 60 * 1000;
    const trialEndMs = explicitTrialEndMs ?? periodEndMs ?? fallbackTrialEndMs;
    const hasEnded = !!best.endedAt && new Date(best.endedAt).getTime() < now;
    const graceMs = AUTH_CONFIG.PAST_DUE_GRACE_DAYS * 24 * 60 * 60 * 1000;

    if (best.status === "active") {
      const activeExpired = !!periodEndMs && periodEndMs < now;
      hasPaidAccess = !activeExpired && !hasEnded;
    }

    if (best.status === "past_due" && periodEndMs) {
      hasPaidAccess = now <= periodEndMs + graceMs;
    }

    if (best.status === "trialing") {
      isTrialing = !Number.isNaN(trialEndMs) && now < trialEndMs;
    }
  }

  if (!best) {
    const trialMs = AUTH_CONFIG.TRIAL_DAYS * 24 * 60 * 60 * 1000;
    isTrialing = now < user.createdAt.getTime() + trialMs;
  }

  // NEW: Check for user-specific feature flags
  let userFlags: Partial<Record<UserFeatureFlagName, boolean | number>> = {};
  try {
    userFlags = await getUserFeatureFlags(user.id);
  } catch (error) {
    console.error("[entitlements] Failed to fetch user feature flags:", error);
    userFlags = {};
  }

  // Tier classification: Priority: Paid > Trial (Active) > Free/Expired
  const tier: EntitlementTier = hasPaidAccess ? "subscribed" : isTrialing ? "trial" : "free";
  
  // Apply user-specific overrides for maxRecords
  const baseMaxRecords = hasPaidAccess
    ? Math.max(flags.maxSubscribedRecords, 500)
    : isTrialing 
      ? Math.min(flags.maxTrialRecords, 100)
      : 0; // Hard cut-off for expired trials to guarantee upgrade conversion

  const maxRecords = userFlags.maxRecords !== undefined 
    ? Number(userFlags.maxRecords) 
    : baseMaxRecords;

  // Apply user-specific overrides for maxSymbols
  const baseMaxSymbols = hasPaidAccess ? 1000 : 100;
  const maxSymbols = userFlags.maxSymbols !== undefined
    ? Number(userFlags.maxSymbols)
    : baseMaxSymbols;

  // Apply user-specific overrides for features
  const features = {
    enableAlerts: userFlags.allowAlerts !== undefined
      ? Boolean(userFlags.allowAlerts)
      : (hasPaidAccess || isTrialing || (tier === "free" && flags.allowTrialAlerts)),
    enableAdvancedIndicators: userFlags.allowAdvancedIndicators !== undefined
      ? Boolean(userFlags.allowAdvancedIndicators)
      : (hasPaidAccess || isTrialing || (tier === "free" && flags.allowTrialAdvancedIndicators)),
    enableCustomSettings: userFlags.allowCustomSettings !== undefined
      ? Boolean(userFlags.allowCustomSettings)
      : (hasPaidAccess || isTrialing || (tier === "free" && flags.allowTrialCustomSettings)),
  };

  const entitlements: ResolvedEntitlements = {
    tier,
    isOwner: false,
    hasPaidAccess,
    isTrialing,
    maxRecords,
    availableRecordOptions: deriveOptions(maxRecords),
    features,
    coins: user.coins ?? 0,
    maxSymbols,
    flags,
    userFlags,
  };

  // Store computed entitlements in cache before returning
  entitlementsCache.set(user.id, entitlements);

  return entitlements;
}
