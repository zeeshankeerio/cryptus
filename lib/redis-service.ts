import { Redis } from '@upstash/redis';

/**
 * RSIQ Pro - Distributed State Layer (Upstash Redis)
 * 
 * This service provides a shared truth for indicators and alert states
 * across all server instances (Vercel, AWS, etc.).
 */

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

// Initialize client only if credentials are present
export const redis = REDIS_URL && REDIS_TOKEN
  ? new Redis({
      url: REDIS_URL,
      token: REDIS_TOKEN,
    })
  : null;

/**
 * JSON-safe Redis operations
 */
export const redisService = {
  /**
   * Set a JSON object with TTL
   */
  async setJson(key: string, value: any, ttlSeconds: number = 30): Promise<boolean> {
    if (!redis) return false;
    try {
      await redis.set(key, JSON.stringify(value), { ex: ttlSeconds });
      return true;
    } catch (err) {
      console.error(`[redis] Set failed for ${key}:`, err);
      return false;
    }
  },

  /**
   * Get a JSON object
   */
  async getJson<T>(key: string): Promise<T | null> {
    if (!redis) return null;
    try {
      const data = await redis.get(key);
      if (typeof data === 'string') {
        return JSON.parse(data) as T;
      }
      return data as T | null;
    } catch (err) {
      console.error(`[redis] Get failed for ${key}:`, err);
      return null;
    }
  },

  /**
   * Distributed Lock implementation
   * Returns true if lock acquired, false otherwise.
   */
  async acquireLock(key: string, ttlSeconds: number = 30): Promise<boolean> {
    if (!redis) return true; // Fail open (allow operation) if Redis is down
    try {
      const lockKey = `lock:${key}`;
      const result = await redis.set(lockKey, 'locked', { ex: ttlSeconds, nx: true });
      const acquired = result === 'OK';
      if (acquired) {
        console.log(`[redis] 🛡️ Lock ACQUIRED: ${lockKey} (TTL ${ttlSeconds}s)`);
      } else {
        console.log(`[redis] 🛡️ Lock CONFLICT: ${lockKey} already held.`);
      }
      return acquired;
    } catch (err) {
      console.error(`[redis] ❌ Lock failed for ${key}:`, err);
      return true; // Fail open
    }
  },

  /**
   * Delete a key
   */
  async del(key: string): Promise<void> {
    if (!redis) return;
    try {
      await redis.del(key);
    } catch (err) {
      console.error(`[redis] Del failed for ${key}:`, err);
    }
  }
};
