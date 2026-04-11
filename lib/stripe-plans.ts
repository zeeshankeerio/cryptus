import type Stripe from "stripe";

const CACHE_TTL_MS = 5 * 60 * 1000;
const PRODUCT_NAME = "RSIQ Pro Subscription";
const CURRENCY = "usd";
const MONTHLY_AMOUNT_CENTS = 2000;
const YEARLY_AMOUNT_CENTS = 20000;

interface StripePlan {
  name: string;
  priceId: string;
  limits: Record<string, number>;
}

interface CachedPlans {
  plans: StripePlan[];
  expiresAt: number;
}

let cache: CachedPlans | null = null;

async function getOrCreateProduct(client: Stripe): Promise<string> {
  const list = await client.products.list({ active: true, limit: 100 });
  const existing = list.data.find((p) => p.name === PRODUCT_NAME);
  if (existing) return existing.id;

  const created = await client.products.create({
    name: PRODUCT_NAME,
    description: "Monthly and yearly subscription for RSIQ Pro.",
  });

  return created.id;
}

async function ensurePrices(
  client: Stripe,
  productId: string,
): Promise<{ monthlyPriceId: string; yearlyPriceId: string }> {
  const list = await client.prices.list({
    active: true,
    type: "recurring",
    product: productId,
    limit: 100,
  });

  let monthlyPriceId: string | null = null;
  let yearlyPriceId: string | null = null;

  for (const price of list.data) {
    if (price.recurring?.interval === "month" && price.unit_amount === MONTHLY_AMOUNT_CENTS) {
      monthlyPriceId = price.id;
    }
    if (price.recurring?.interval === "year" && price.unit_amount === YEARLY_AMOUNT_CENTS) {
      yearlyPriceId = price.id;
    }
  }

  if (!monthlyPriceId) {
    const created = await client.prices.create({
      product: productId,
      currency: CURRENCY,
      unit_amount: MONTHLY_AMOUNT_CENTS,
      recurring: { interval: "month" },
      metadata: { plan_name: "monthly" },
    });
    monthlyPriceId = created.id;
  }

  if (!yearlyPriceId) {
    const created = await client.prices.create({
      product: productId,
      currency: CURRENCY,
      unit_amount: YEARLY_AMOUNT_CENTS,
      recurring: { interval: "year" },
      metadata: { plan_name: "yearly" },
    });
    yearlyPriceId = created.id;
  }

  return { monthlyPriceId, yearlyPriceId };
}

export async function getPlansFromStripe(client: Stripe): Promise<StripePlan[]> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return cache.plans;
  }

  try {
    const productId = await getOrCreateProduct(client);
    const { monthlyPriceId, yearlyPriceId } = await ensurePrices(client, productId);

    const plans: StripePlan[] = [
      { name: "monthly", priceId: monthlyPriceId, limits: { alerts: 500 } },
      { name: "yearly", priceId: yearlyPriceId, limits: { alerts: 500 } },
    ];

    cache = { plans, expiresAt: now + CACHE_TTL_MS };
    return plans;
  } catch (error) {
    console.error("[stripe-plans] Failed to get plans:", error);
    return cache?.plans || [];
  }
}
