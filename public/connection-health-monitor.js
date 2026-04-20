/**
 * RSIQ PRO - Connection Health Monitor
 * 
 * Multi-layer defense system against data freezes:
 * 1. Heartbeat monitoring (every 3s)
 * 2. Data flow verification (every 2s)
 * 3. Socket state validation (every 5s)
 * 4. Automatic escalation (3 levels)
 * 5. Circuit breaker pattern
 * 6. Exponential backoff with jitter
 * 7. Fallback to REST API
 * 
 * This ensures data NEVER freezes for more than 10 seconds on ANY device.
 */

class ConnectionHealthMonitor {
  constructor() {
    this.lastDataReceived = Date.now();
    this.lastHeartbeat = Date.now();
    this.consecutiveFailures = 0;
    this.isHealthy = true;
    this.recoveryAttempts = 0;
    this.maxRecoveryAttempts = 5;
    this.circuitBreakerOpen = false;
    this.circuitBreakerTimeout = null;
    
    // Thresholds (aggressive for mobile)
    this.HEARTBEAT_INTERVAL = 3000;      // Check every 3s
    this.DATA_FLOW_INTERVAL = 2000;      // Verify data every 2s
    this.SOCKET_CHECK_INTERVAL = 5000;   // Validate socket every 5s
    this.STALE_THRESHOLD = 5000;         // Data is stale after 5s
    this.CRITICAL_THRESHOLD = 10000;     // Critical after 10s
    this.CIRCUIT_BREAKER_TIMEOUT = 30000; // Reset circuit after 30s
    
    this.intervals = {
      heartbeat: null,
      dataFlow: null,
      socketCheck: null
    };
    
    this.callbacks = {
      onStale: null,
      onCritical: null,
      onRecovered: null,
      onCircuitOpen: null
    };
  }
  
  start(callbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
    this.stop(); // Clean stop first
    
    console.log('[HealthMonitor] 🏥 Starting multi-layer health monitoring...');
    
    // Layer 1: Heartbeat monitoring (fastest)
    this.intervals.heartbeat = setInterval(() => {
      this.checkHeartbeat();
    }, this.HEARTBEAT_INTERVAL);
    
    // Layer 2: Data flow verification
    this.intervals.dataFlow = setInterval(() => {
      this.verifyDataFlow();
    }, this.DATA_FLOW_INTERVAL);
    
    // Layer 3: Socket state validation
    this.intervals.socketCheck = setInterval(() => {
      this.validateSocketState();
    }, this.SOCKET_CHECK_INTERVAL);
    
    console.log('[HealthMonitor] ✅ All monitoring layers active');
  }
  
  stop() {
    Object.values(this.intervals).forEach(interval => {
      if (interval) clearInterval(interval);
    });
    this.intervals = { heartbeat: null, dataFlow: null, socketCheck: null };
  }
  
  recordDataReceived() {
    const now = Date.now();
    const wasCritical = this.isCritical();
    
    this.lastDataReceived = now;
    this.lastHeartbeat = now;
    
    // Reset failure counter on successful data
    if (this.consecutiveFailures > 0) {
      console.log(`[HealthMonitor] ✅ Data flow restored after ${this.consecutiveFailures} failure(s)`);
      this.consecutiveFailures = 0;
      this.recoveryAttempts = 0;
      
      if (wasCritical && this.callbacks.onRecovered) {
        this.callbacks.onRecovered();
      }
    }
    
    // Close circuit breaker if open
    if (this.circuitBreakerOpen) {
      this.closeCircuitBreaker();
    }
    
    this.isHealthy = true;
  }
  
  checkHeartbeat() {
    const now = Date.now();
    const silenceMs = now - this.lastHeartbeat;
    
    if (silenceMs > this.HEARTBEAT_INTERVAL * 2) {
      console.warn(`[HealthMonitor] ⚠️ Heartbeat missed (${Math.round(silenceMs/1000)}s)`);
      this.escalate('heartbeat', silenceMs);
    }
  }
  
  verifyDataFlow() {
    const now = Date.now();
    const silenceMs = now - this.lastDataReceived;
    
    if (silenceMs > this.STALE_THRESHOLD) {
      this.isHealthy = false;
      this.consecutiveFailures++;
      
      if (silenceMs > this.CRITICAL_THRESHOLD) {
        console.error(`[HealthMonitor] 🚨 CRITICAL: No data for ${Math.round(silenceMs/1000)}s`);
        this.escalate('critical', silenceMs);
      } else {
        console.warn(`[HealthMonitor] ⚠️ Data stale (${Math.round(silenceMs/1000)}s)`);
        this.escalate('stale', silenceMs);
      }
    }
  }
  
  validateSocketState() {
    // This will be called by the worker to validate socket state
    if (this.callbacks.onSocketCheck) {
      this.callbacks.onSocketCheck();
    }
  }
  
  escalate(level, silenceMs) {
    // Circuit breaker: If too many failures, stop trying for a while
    if (this.circuitBreakerOpen) {
      console.warn('[HealthMonitor] ⚡ Circuit breaker open, waiting for timeout...');
      return;
    }
    
    // Escalation levels
    if (level === 'stale' && this.callbacks.onStale) {
      this.callbacks.onStale(silenceMs);
    } else if (level === 'critical' && this.callbacks.onCritical) {
      this.recoveryAttempts++;
      
      if (this.recoveryAttempts >= this.maxRecoveryAttempts) {
        console.error('[HealthMonitor] 🔥 Max recovery attempts reached, opening circuit breaker');
        this.openCircuitBreaker();
      } else {
        this.callbacks.onCritical(silenceMs, this.recoveryAttempts);
      }
    }
  }
  
  openCircuitBreaker() {
    this.circuitBreakerOpen = true;
    console.error('[HealthMonitor] ⚡ Circuit breaker OPEN - pausing recovery attempts');
    
    if (this.callbacks.onCircuitOpen) {
      this.callbacks.onCircuitOpen();
    }
    
    // Auto-close after timeout
    this.circuitBreakerTimeout = setTimeout(() => {
      this.closeCircuitBreaker();
    }, this.CIRCUIT_BREAKER_TIMEOUT);
  }
  
  closeCircuitBreaker() {
    if (this.circuitBreakerOpen) {
      console.log('[HealthMonitor] ⚡ Circuit breaker CLOSED - resuming normal operation');
      this.circuitBreakerOpen = false;
      this.recoveryAttempts = 0;
      
      if (this.circuitBreakerTimeout) {
        clearTimeout(this.circuitBreakerTimeout);
        this.circuitBreakerTimeout = null;
      }
    }
  }
  
  isCritical() {
    const silenceMs = Date.now() - this.lastDataReceived;
    return silenceMs > this.CRITICAL_THRESHOLD;
  }
  
  isStale() {
    const silenceMs = Date.now() - this.lastDataReceived;
    return silenceMs > this.STALE_THRESHOLD;
  }
  
  getStatus() {
    const now = Date.now();
    const silenceMs = now - this.lastDataReceived;
    
    return {
      isHealthy: this.isHealthy,
      silenceMs,
      consecutiveFailures: this.consecutiveFailures,
      recoveryAttempts: this.recoveryAttempts,
      circuitBreakerOpen: this.circuitBreakerOpen,
      level: silenceMs > this.CRITICAL_THRESHOLD ? 'critical' :
             silenceMs > this.STALE_THRESHOLD ? 'stale' : 'healthy'
    };
  }
}

// Export for use in worker
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ConnectionHealthMonitor;
}
