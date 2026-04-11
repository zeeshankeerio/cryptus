import { AUTH_CONFIG } from "@/lib/config";
import { getFeatureFlags, type FeatureFlags } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";

const RECORD_OPTIONS = [100, 200, 300, 500] as const;

type EntitlementUser = {
  id: string;
  email: string;
  role: string | null;
  createdAt: Date;
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
  flags: FeatureFlags;
}

type SubscriptionLite = {
  status: string;
  periodEnd: Date | null;
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
  const flags = await getFeatureFlags();

  if (!user) {
    const maxRecords = Math.min(flags.maxTrialRecords, 100);
    return {
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
      flags,
    };
  }

  if (isOwnerUser(user)) {
    const maxRecords = Math.max(flags.maxSubscribedRecords, 500);
    return {
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
      flags,
    };
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
      isTrialing = true;
    }
  }

  if (!best) {
    const trialMs = AUTH_CONFIG.TRIAL_DAYS * 24 * 60 * 60 * 1000;
    isTrialing = now < user.createdAt.getTime() + trialMs;
  }

  const tier: EntitlementTier = hasPaidAccess ? "subscribed" : isTrialing ? "trial" : "free";
  const maxRecords = hasPaidAccess
    ? Math.max(flags.maxSubscribedRecords, 500)
    : Math.min(flags.maxTrialRecords, 100);

  const trialFeaturesEnabled = isTrialing || tier === "free";

  return {
    tier,
    isOwner: false,
    hasPaidAccess,
    isTrialing,
    maxRecords,
    availableRecordOptions: deriveOptions(maxRecords),
    features: {
      enableAlerts: hasPaidAccess || (trialFeaturesEnabled && flags.allowTrialAlerts),
      enableAdvancedIndicators:
        hasPaidAccess || (trialFeaturesEnabled && flags.allowTrialAdvancedIndicators),
      enableCustomSettings:
        hasPaidAccess || (trialFeaturesEnabled && flags.allowTrialCustomSettings),
    },
    flags,
  };
}
