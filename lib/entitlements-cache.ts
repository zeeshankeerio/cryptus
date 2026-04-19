import type { ResolvedEntitlements } from "@/lib/entitlements";

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class EntitlementsCache {
  private cache = new Map<string, CacheEntry<ResolvedEntitlements>>();
  private ttl = 60 * 1000; // 60 seconds

  get(userId: string): ResolvedEntitlements | null {
    const entry = this.cache.get(`entitlements:${userId}`);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(`entitlements:${userId}`);
      return null;
    }

    return entry.data;
  }

  set(userId: string, entitlements: ResolvedEntitlements): void {
    this.cache.set(`entitlements:${userId}`, {
      data: entitlements,
      expiresAt: Date.now() + this.ttl,
    });
  }

  invalidate(userId: string): void {
    this.cache.delete(`entitlements:${userId}`);
  }

  clear(): void {
    this.cache.clear();
  }
}

export const entitlementsCache = new EntitlementsCache();
