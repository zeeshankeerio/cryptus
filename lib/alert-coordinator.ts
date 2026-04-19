import { prisma } from './prisma'
import { redisService } from './redis-service'

// ── AlertRecord interface ──────────────────────────────────────────────────────

export interface AlertRecord {
  userId?: string
  symbol: string
  exchange: string
  timeframe: string
  type: string  // 'OVERSOLD' | 'OVERBOUGHT' | 'STRATEGY_STRONG_BUY' etc.
  value: number
}

// ── AlertCoordinator class ────────────────────────────────────────────────────

class AlertCoordinator {
  // ── Cooldown key ────────────────────────────────────────────────────────────

  /**
   * Returns a standardized cooldown key.
   * Format: `{symbol}:{exchange}:{timeframe}:{conditionType}`
   * Example: "BTCUSDT:binance:5m:OVERSOLD"
   */
  getCooldownKey(
    symbol: string,
    exchange: string,
    timeframe: string,
    conditionType: string,
  ): string {
    return `${symbol}:${exchange}:${timeframe}:${conditionType}`
  }

  // ── Redis-backed cooldown cache ────────────────────────────────────────────────

  /**
   * Returns true if the key is still within its cooldown window.
   */
  async isInCooldown(key: string, cooldownMs: number): Promise<boolean> {
    const lastTrigger = await redisService.getJson<number>(`alert:cool:${key}`);
    if (lastTrigger === null) return false;
    return Date.now() - lastTrigger < cooldownMs;
  }

  /**
   * Records the current timestamp for the given key.
   */
  async setCooldown(key: string, cooldownMs: number = 180000): Promise<void> {
    await redisService.setJson(`alert:cool:${key}`, Date.now(), Math.ceil(cooldownMs / 1000));
  }

  /**
   * Removes the cooldown entry for the given key.
   */
  async clearCooldown(key: string): Promise<void> {
    await redisService.del(`alert:cool:${key}`);
  }

  /**
   * Clears all in-memory cooldown entries.
   * (Note: Namespaced clear in Redis is complex, but for this scale we just trust TTLs)
   */
  async clearAllCooldowns(): Promise<void> {
    // In distributed scale, individual TTLs handle the cleanup.
  }

  // ── Database-backed alert recording ────────────────────────────────────────

  /**
   * Writes an alert record to the AlertLog table.
   */
  async recordAlert(alert: AlertRecord): Promise<void> {
    try {
      await prisma.alertLog.create({
        data: {
          userId: alert.userId,
          symbol: alert.symbol,
          exchange: alert.exchange,
          timeframe: alert.timeframe,
          type: alert.type,
          value: alert.value,
        },
      })
    } catch (err) {
      console.error('[alert-coordinator] Failed to record alert:', err)
      throw err
    }
  }

  /**
   * Checks the database to see if an alert for this key was recorded within
   * the given cooldown window. Returns true if still in cooldown.
   *
   * Used for cross-instance coordination (e.g. multiple Vercel instances).
   */
  async checkDbCooldown(
    userId: string | undefined,
    symbol: string,
    exchange: string,
    timeframe: string,
    conditionType: string,
    cooldownMs: number,
  ): Promise<boolean> {
    const cutoff = new Date(Date.now() - cooldownMs)
    try {
      const recent = await prisma.alertLog.findFirst({
        where: {
          userId,
          symbol,
          exchange,
          timeframe,
          type: conditionType,
          createdAt: { gte: cutoff },
        },
      })
      return recent !== null
    } catch (err) {
      console.error('[alert-coordinator] Failed to check DB cooldown:', err)
      // Fail open: if DB is unavailable, don't block alerts
      return false
    }
  }
}

// ── Singleton export ──────────────────────────────────────────────────────────

export const alertCoordinator = new AlertCoordinator()
