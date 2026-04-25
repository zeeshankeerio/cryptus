import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/api-auth";
import { getAllUserFeatureFlags, type UserFeatureFlagName } from "@/lib/user-feature-flags";
import { getFeatureFlags } from "@/lib/feature-flags";

type EffectiveFlags = {
  allowAdvancedIndicators: { value: boolean; source: "global" | "user" };
  allowAlerts: { value: boolean; source: "global" | "user" };
  allowCustomSettings: { value: boolean; source: "global" | "user" };
  maxRecords: { value: number; source: "global" | "user" };
  maxSymbols: { value: number; source: "global" | "user" };
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const owner = await requireOwner();
    if (!owner) {
      return NextResponse.json(
        { error: "Owner access required" },
        { status: 403 }
      );
    }

    const { userId } = await params;

    // Retrieve user-specific flags
    const userFlags = await getAllUserFeatureFlags(userId);

    // Retrieve global flags
    const globalFlags = await getFeatureFlags();

    // Build user flags map
    const userFlagsMap = userFlags.reduce((acc, flag) => {
      acc[flag.flagName as UserFeatureFlagName] = flag.flagValue;
      return acc;
    }, {} as Partial<Record<UserFeatureFlagName, boolean | number>>);

    // Compute effective flags (user overrides + global defaults)
    const effectiveFlags: EffectiveFlags = {
      allowAdvancedIndicators: {
        value: userFlagsMap.allowAdvancedIndicators !== undefined
          ? Boolean(userFlagsMap.allowAdvancedIndicators)
          : globalFlags.allowTrialAdvancedIndicators,
        source: userFlagsMap.allowAdvancedIndicators !== undefined ? "user" : "global",
      },
      allowAlerts: {
        value: userFlagsMap.allowAlerts !== undefined
          ? Boolean(userFlagsMap.allowAlerts)
          : globalFlags.allowTrialAlerts,
        source: userFlagsMap.allowAlerts !== undefined ? "user" : "global",
      },
      allowCustomSettings: {
        value: userFlagsMap.allowCustomSettings !== undefined
          ? Boolean(userFlagsMap.allowCustomSettings)
          : globalFlags.allowTrialCustomSettings,
        source: userFlagsMap.allowCustomSettings !== undefined ? "user" : "global",
      },
      maxRecords: {
        value: userFlagsMap.maxRecords !== undefined
          ? Number(userFlagsMap.maxRecords)
          : globalFlags.maxTrialRecords,
        source: userFlagsMap.maxRecords !== undefined ? "user" : "global",
      },
      maxSymbols: {
        value: userFlagsMap.maxSymbols !== undefined
          ? Number(userFlagsMap.maxSymbols)
          : 100, // Default for trial/free users
        source: userFlagsMap.maxSymbols !== undefined ? "user" : "global",
      },
    };

    return NextResponse.json({
      userId,
      flags: userFlags.map((flag) => ({
        flagName: flag.flagName,
        flagValue: flag.flagValue,
        updatedAt: flag.updatedAt.toISOString(),
      })),
      effectiveFlags,
    });
  } catch (error) {
    console.error("[admin/user-flags] GET error:", error);
    return NextResponse.json(
      { error: "Failed to retrieve user feature flags" },
      { status: 500 }
    );
  }
}
