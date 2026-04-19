import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

type BillingHistoryItem = {
  id: string;
  date: string;
  amount: number;
  status: "paid" | "pending" | "failed";
  invoiceUrl: string | null;
  description: string;
};

export async function GET(req: NextRequest) {
  try {
    const ctx = await getSessionUser();
    if (ctx.error) {
      return ctx.error;
    }

    if (!ctx.user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get("limit")) || 10, 50);
    const offset = Number(searchParams.get("offset")) || 0;

    const history: BillingHistoryItem[] = [];

    // Retrieve manual renewal records from database
    const manualRenewals = await prisma.subscription.findMany({
      where: {
        referenceId: ctx.user.id,
        invoiceRef: {
          not: null,
        },
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        invoiceRef: true,
        renewalNotes: true,
        plan: true,
        updatedAt: true,
      },
    });

    // Add manual renewals to history
    manualRenewals.forEach((renewal) => {
      if (renewal.invoiceRef) {
        history.push({
          id: renewal.id,
          date: renewal.updatedAt.toISOString(),
          amount: renewal.plan === "yearly" ? 290 : 29, // Example pricing
          status: "paid",
          invoiceUrl: null,
          description: `Manual Renewal - ${renewal.plan} (${renewal.invoiceRef})${renewal.renewalNotes ? ` - ${renewal.renewalNotes}` : ""}`,
        });
      }
    });

    // TODO: Integrate with Stripe API to retrieve invoice history
    // if (user?.stripeCustomerId) {
    //   const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    //   const invoices = await stripe.invoices.list({
    //     customer: user.stripeCustomerId,
    //     limit: limit,
    //   });
    //   invoices.data.forEach((invoice: any) => {
    //     history.push({
    //       id: invoice.id,
    //       date: new Date(invoice.created * 1000).toISOString(),
    //       amount: invoice.amount_paid / 100,
    //       status: invoice.status === 'paid' ? 'paid' : invoice.status === 'open' ? 'pending' : 'failed',
    //       invoiceUrl: invoice.invoice_pdf,
    //       description: invoice.description || `Invoice ${invoice.number}`,
    //     });
    //   });
    // }

    // Sort by date descending
    history.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Apply pagination
    const paginatedHistory = history.slice(offset, offset + limit);

    return NextResponse.json({
      history: paginatedHistory,
      total: history.length,
    });
  } catch (error) {
    console.error("[user/billing-history] GET error:", error);
    return NextResponse.json(
      { error: "Failed to retrieve billing history" },
      { status: 500 }
    );
  }
}
