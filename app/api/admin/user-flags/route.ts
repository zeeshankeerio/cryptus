import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/api-auth";
import { setUserFeatureFlag, type UserFeatureFlagName } from "@/lib/user-feature-flags";

const VALID_FLAG_NAMES: UserFeatureFlagName[] = [
  "allowAdvancedIndicators",
  "allowAlerts",
  "allowCustomSettings",
  "maxRecords",
  "maxSymbols",
];

export async function POST(req: NextRequest) {
  try {
    const owner = await requireOwner();
    if (owner.error) {
      return owner.error;
    }

    const body = await req.json();
    const { userId, flagName, flagValue } = body;

    // Validate required fields
    if (!userId || !flagName || flagValue === undefined) {
      return NextResponse.json(
        { error: "userId, flagName, and flagValue are required" },
        { status: 400 }
      );
    }

    // Validate flagName
    if (!VALID_FLAG_NAMES.includes(flagName as UserFeatureFlagName)) {
      return NextResponse.json(
        { error: `Invalid flagName. Must be one of: ${VALID_FLAG_NAMES.join(", ")}` },
        { status: 400 }
      );
    }

    // Validate flagValue type
    if (typeof flagValue !== "boolean" && typeof flagValue !== "number") {
      return NextResponse.json(
        { error: "flagValue must be a boolean or number" },
        { status: 400 }
      );
    }

    // Set the user feature flag
    const flag = await setUserFeatureFlag(
      userId,
      flagName as UserFeatureFlagName,
      flagValue
    );

    return NextResponse.json({
      ok: true,
      flag: {
        id: flag.id,
        userId: flag.userId,
        flagName: flag.flagName,
        flagValue: flag.flagValue,
        updatedAt: flag.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("[admin/user-flags] POST error:", error);
    return NextResponse.json(
      { error: "Failed to set user feature flag" },
      { status: 500 }
    );
  }
}
