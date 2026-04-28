/**
 * Audit Logger for SUPER_SIGNAL
 * 
 * Provides structured logging for signal computations with:
 * - Deterministic replay via input hashing
 * - Performance metrics tracking
 * - Failure event monitoring
 * - In-memory ring buffer with async persistence
 */

import { createHash } from 'crypto';
import type { SuperSignalResult, ComponentScores } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface AuditLogEntry {
  symbol: string;
  timestamp: number;
  algorithmVersion: string;
  componentScores: ComponentScores;
  finalValue: number;
  category: string;
  inputHash: string;
  computeTimeMs: number;
  cacheHits?: number;
  cacheMisses?: number;
  errors?: string[];
  weights?: {
    regime: number;
    liquidity: number;
    entropy: number;
    crossAsset: number;
    risk: number;
  };
}

export interface FailureEvent {
  symbol: string;
  timestamp: number;
  component: string;
  error: string;
  fallbackActivated: boolean;
}

export interface PerformanceMetrics {
  symbol: string;
  timestamp: number;
  regimeTimeMs: number;
  liquidityTimeMs: number;
  entropyTimeMs: number;
  crossAssetTimeMs: number;
  riskTimeMs: number;
  fusionTimeMs: number;
  totalTimeMs: number;
  cacheHitRate: number;
}

export interface AuditQueryOptions {
  symbol?: string;
  fromTs?: number;
  toTs?: number;
  minScore?: number;
  maxScore?: number;
  limit?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Ring Buffer Implementation
// ─────────────────────────────────────────────────────────────────────────────

class RingBuffer<T> {
  private buffer: T[];
  private head = 0;
  private size = 0;
  private readonly capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buffer = new Array(capacity);
  }

  push(item: T): void {
    this.buffer[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    if (this.size < this.capacity) {
      this.size++;
    }
  }

  getAll(): T[] {
    if (this.size < this.capacity) {
      return this.buffer.slice(0, this.size);
    }
    // Return in chronological order
    return [...this.buffer.slice(this.head), ...this.buffer.slice(0, this.head)];
  }

  clear(): void {
    this.head = 0;
    this.size = 0;
  }

  getSize(): number {
    return this.size;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit Logger Class
// ─────────────────────────────────────────────────────────────────────────────

class AuditLogger {
  private auditLogs: RingBuffer<AuditLogEntry>;
  private failureEvents: RingBuffer<FailureEvent>;
  private performanceMetrics: RingBuffer<PerformanceMetrics>;
  private flushInterval: NodeJS.Timeout | null = null;
  private readonly RETENTION_DAYS = 90;
  private readonly FLUSH_INTERVAL_MS = 60000; // 1 minute

  constructor() {
    this.auditLogs = new RingBuffer<AuditLogEntry>(10000);
    this.failureEvents = new RingBuffer<FailureEvent>(1000);
    this.performanceMetrics = new RingBuffer<PerformanceMetrics>(5000);
    
    // Start async flush timer
    this.startFlushTimer();
  }

  /**
   * Compute SHA-256 hash of input parameters for deterministic replay
   */
  hashInput(input: Record<string, any>): string {
    const serialized = JSON.stringify(input, Object.keys(input).sort());
    return createHash('sha256').update(serialized).digest('hex');
  }

  /**
   * Log a successful SUPER_SIGNAL computation
   */
  logComputation(
    symbol: string,
    result: SuperSignalResult,
    inputHash: string,
    computeTimeMs: number,
    cacheHits = 0,
    cacheMisses = 0,
    weights?: AuditLogEntry['weights']
  ): void {
    const entry: AuditLogEntry = {
      symbol,
      timestamp: Date.now(),
      algorithmVersion: result.algorithmVersion,
      componentScores: result.components,
      finalValue: result.value,
      category: result.category,
      inputHash,
      computeTimeMs,
      cacheHits,
      cacheMisses,
      weights,
    };

    this.auditLogs.push(entry);
  }

  /**
   * Log a component failure event
   */
  logFailure(
    symbol: string,
    component: string,
    error: string,
    fallbackActivated: boolean
  ): void {
    const event: FailureEvent = {
      symbol,
      timestamp: Date.now(),
      component,
      error,
      fallbackActivated,
    };

    this.failureEvents.push(event);
    
    // Check failure rate and alert if threshold exceeded
    this.checkFailureRate();
  }

  /**
   * Log performance metrics for a computation
   */
  logPerformance(metrics: PerformanceMetrics): void {
    this.performanceMetrics.push(metrics);
  }

  /**
   * Query audit logs with filters
   */
  getAuditLogs(options: AuditQueryOptions = {}): AuditLogEntry[] {
    const {
      symbol,
      fromTs = Date.now() - this.RETENTION_DAYS * 24 * 60 * 60 * 1000,
      toTs = Date.now(),
      minScore,
      maxScore,
      limit = 1000,
    } = options;

    let logs = this.auditLogs.getAll();

    // Apply filters
    logs = logs.filter((log) => {
      if (log.timestamp < fromTs || log.timestamp > toTs) return false;
      if (symbol && log.symbol !== symbol) return false;
      if (minScore !== undefined && log.finalValue < minScore) return false;
      if (maxScore !== undefined && log.finalValue > maxScore) return false;
      return true;
    });

    // Sort by timestamp descending (most recent first)
    logs.sort((a, b) => b.timestamp - a.timestamp);

    return logs.slice(0, limit);
  }

  /**
   * Get failure events within time window
   */
  getFailureEvents(fromTs?: number, toTs?: number): FailureEvent[] {
    const from = fromTs ?? Date.now() - 60 * 60 * 1000; // Default: last hour
    const to = toTs ?? Date.now();

    return this.failureEvents
      .getAll()
      .filter((event) => event.timestamp >= from && event.timestamp <= to)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get performance metrics within time window
   */
  getPerformanceMetrics(fromTs?: number, toTs?: number): PerformanceMetrics[] {
    const from = fromTs ?? Date.now() - 60 * 60 * 1000; // Default: last hour
    const to = toTs ?? Date.now();

    return this.performanceMetrics
      .getAll()
      .filter((metric) => metric.timestamp >= from && metric.timestamp <= to)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Check failure rate over last hour and alert if >5%
   */
  private checkFailureRate(): void {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const recentFailures = this.failureEvents
      .getAll()
      .filter((event) => event.timestamp >= oneHourAgo);

    const recentComputations = this.auditLogs
      .getAll()
      .filter((log) => log.timestamp >= oneHourAgo);

    const totalComputations = recentComputations.length + recentFailures.length;
    
    if (totalComputations === 0) return;

    const failureRate = recentFailures.length / totalComputations;

    if (failureRate > 0.05) {
      // Group failures by component
      const failuresByComponent = recentFailures.reduce((acc, event) => {
        acc[event.component] = (acc[event.component] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      console.error(
        `[super-signal] CRITICAL: Failure rate ${(failureRate * 100).toFixed(2)}% exceeds 5% threshold over last hour`,
        {
          totalComputations,
          totalFailures: recentFailures.length,
          failureRate: `${(failureRate * 100).toFixed(2)}%`,
          failuresByComponent,
        }
      );
    }
  }

  /**
   * Start periodic flush to persistent storage
   */
  private startFlushTimer(): void {
    if (this.flushInterval) return;

    this.flushInterval = setInterval(() => {
      this.flushToPersistentStore();
    }, this.FLUSH_INTERVAL_MS);
  }

  /**
   * Flush in-memory buffers to persistent storage (Redis/DB)
   * Currently logs to console; integrate with Redis/DB as needed
   */
  private async flushToPersistentStore(): Promise<void> {
    try {
      const logs = this.auditLogs.getAll();
      const failures = this.failureEvents.getAll();
      const metrics = this.performanceMetrics.getAll();

      if (logs.length === 0 && failures.length === 0 && metrics.length === 0) {
        return;
      }

      // TODO: Integrate with Redis or database
      // For now, just log summary
      console.log(`[super-signal] Audit flush: ${logs.length} logs, ${failures.length} failures, ${metrics.length} metrics`);

      // In production, you would:
      // await redisService.setJson('super-signal:audit-logs', logs, 90 * 24 * 60 * 60);
      // await redisService.setJson('super-signal:failures', failures, 7 * 24 * 60 * 60);
      // await redisService.setJson('super-signal:metrics', metrics, 7 * 24 * 60 * 60);
    } catch (error) {
      console.error('[super-signal] Error flushing audit logs:', error);
    }
  }

  /**
   * Stop flush timer (for cleanup)
   */
  stopFlushTimer(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
  }

  /**
   * Get statistics summary
   */
  getStats(): {
    totalLogs: number;
    totalFailures: number;
    totalMetrics: number;
    recentFailureRate: number;
    avgComputeTime: number;
    avgCacheHitRate: number;
  } {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const recentLogs = this.auditLogs.getAll().filter((log) => log.timestamp >= oneHourAgo);
    const recentFailures = this.failureEvents.getAll().filter((event) => event.timestamp >= oneHourAgo);

    const totalComputations = recentLogs.length + recentFailures.length;
    const recentFailureRate = totalComputations > 0 ? recentFailures.length / totalComputations : 0;

    const avgComputeTime =
      recentLogs.length > 0
        ? recentLogs.reduce((sum, log) => sum + log.computeTimeMs, 0) / recentLogs.length
        : 0;

    const logsWithCache = recentLogs.filter((log) => log.cacheHits !== undefined && log.cacheMisses !== undefined);
    const avgCacheHitRate =
      logsWithCache.length > 0
        ? logsWithCache.reduce((sum, log) => {
            const total = (log.cacheHits || 0) + (log.cacheMisses || 0);
            return sum + (total > 0 ? (log.cacheHits || 0) / total : 0);
          }, 0) / logsWithCache.length
        : 0;

    return {
      totalLogs: this.auditLogs.getSize(),
      totalFailures: this.failureEvents.getSize(),
      totalMetrics: this.performanceMetrics.getSize(),
      recentFailureRate,
      avgComputeTime,
      avgCacheHitRate,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton Instance
// ─────────────────────────────────────────────────────────────────────────────

export const auditLogger = new AuditLogger();
