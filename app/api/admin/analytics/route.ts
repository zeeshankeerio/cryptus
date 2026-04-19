import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { AUTH_CONFIG } from "@/lib/config";

export async function GET(req: NextRequest) {
  try {
    const owner = await requireOwner();
    if (owner.error) {
      return owner.error;
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Total users count
    const totalUsers = await prisma.user.count();

    // Trial users count (users within 14 days of creation with no active subscription)
    const trialCutoff = new Date(now.getTime() - AUTH_CONFIG.TRIAL_DAYS * 24 * 60 * 60 * 1000);
    const trialUsers = await prisma.user.count({
      where: {
        createdAt: {
          gte: trialCutoff,
        },
        subscriptions: {
          none: {
            status: {
              in: ["active", "trialing"],
            },
          },
        },
      },
    });

    // Subscribed users count (active subscriptions)
    const subscribedUsers = await prisma.subscription.count({
      where: {
        status: "active",
        periodEnd: {
          gte: now,
        },
      },
    });

    // Suspended users count
    const suspendedUsers = await prisma.user.count({
      where: {
        banned: true,
      },
    });

    // Expired subscriptions count
    const expiredUsers = await prisma.subscription.count({
      where: {
        OR: [
          {
            status: "active",
            periodEnd: {
              lt: now,
            },
          },
          {
            status: {
              in: ["canceled", "cancelled"],
            },
          },
        ],
      },
    });

    // Calculate MRR (Monthly Recurring Revenue) - simplified calculation
    // Assuming monthly plan is $X and yearly is $Y/12
    const activeSubscriptions = await prisma.subscription.findMany({
      where: {
        status: "active",
        periodEnd: {
          gte: now,
        },
      },
      select: {
        plan: true,
      },
    });

    let mrr = 0;
    let arr = 0;

    // Simplified revenue calculation (adjust based on actual pricing)
    const MONTHLY_PRICE = 29; // Example price
    const YEARLY_PRICE = 290; // Example price

    activeSubscriptions.forEach((sub) => {
      if (sub.plan === "monthly") {
        mrr += MONTHLY_PRICE;
        arr += MONTHLY_PRICE * 12;
      } else if (sub.plan === "yearly") {
        mrr += YEARLY_PRICE / 12;
        arr += YEARLY_PRICE;
      }
    });

    // New users this month
    const newUsersThisMonth = await prisma.user.count({
      where: {
        createdAt: {
          gte: startOfMonth,
        },
      },
    });

    // New subscriptions this month
    const newSubscriptionsThisMonth = await prisma.subscription.count({
      where: {
        createdAt: {
          gte: startOfMonth,
        },
        status: "active",
      },
    });

    // Churn rate calculation (simplified)
    const churnedThisMonth = await prisma.subscription.count({
      where: {
        status: {
          in: ["canceled", "cancelled"],
        },
        updatedAt: {
          gte: startOfMonth,
        },
      },
    });

    const churnRate = subscribedUsers > 0 ? (churnedThisMonth / subscribedUsers) * 100 : 0;

    return NextResponse.json({
      users: {
        total: totalUsers,
        trial: trialUsers,
        subscribed: subscribedUsers,
        suspended: suspendedUsers,
        expired: expiredUsers,
      },
      revenue: {
        mrr: Math.round(mrr),
        arr: Math.round(arr),
      },
      growth: {
        newUsersThisMonth,
        newSubscriptionsThisMonth,
        churnRate: Math.round(churnRate * 100) / 100,
      },
    });
  } catch (error) {
    console.error("[admin/analytics] GET error:", error);
    return NextResponse.json(
      { error: "Failed to retrieve analytics" },
      { status: 500 }
    );
  }
}
