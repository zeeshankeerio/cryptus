import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/api-auth";
import { deleteUserFeatureFlag, type UserFeatureFlagName } from "@/lib/user-feature-flags";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string; flagName: string }> }
) {
  try {
    const owner = await requireOwner();
    if (owner.error) {
      return owner.error;
    }

    const { userId, flagName } = await params;

    // Delete the user feature flag
    await deleteUserFeatureFlag(userId, flagName as UserFeatureFlagName);

    return NextResponse.json({
      ok: true,
      message: `User feature flag '${flagName}' removed for user ${userId}`,
    });
  } catch (error) {
    console.error("[admin/user-flags] DELETE error:", error);
    return NextResponse.json(
      { error: "Failed to delete user feature flag" },
      { status: 500 }
    );
  }
}
