# Production Monitoring Guide

## Quick Health Checks

### 1. Check for 429 Errors
```javascript
// Browser Console
// Should see ZERO 429 errors after 5 minutes
console.log('Checking for rate limit errors...');
```

**Expected:** No 429 errors on `/api/signals/sync`

---

### 2. Check WebSocket Health
```javascript
// Browser Console
// Look for derivatives worker status
// Should show all streams as "connected"
```

**Expected:** 
- Funding stream: ✅ Connected
- Liquidation streams: ✅ Connected  
- Whale stream: ✅ Connected
- No "Ping received after close" errors

---

### 3. Check Metals Data
```javascript
// Browser Console
// Should see successful fetches, no timeouts
```

**Expected:** Metals data loads within 30 seconds

---

### 4. Test Search Functionality
```
1. Enter "BTC" in search
2. Enter "BTCUSDT" in search
3. Clear search
4. Enter invalid input
```

**Expected:** No TypeError crashes

---

## Error Patterns to Watch

### ❌ BAD - Rate Limiting
```
api/signals/sync:1 Failed to load resource: 429
api/signals/sync:1 Failed to load resource: 429
api/signals/sync:1 Failed to load resource: 429
```

### ✅ GOOD - No Rate Limiting
```
[win-rate-sync] Synchronized successfully
```

---

### ❌ BAD - WebSocket Errors
```
WebSocket connection to 'wss://...' failed: Ping received after close
WebSocket connection to 'wss://...' failed: Ping received after close
```

### ✅ GOOD - Stable WebSockets
```
[deriv-worker] Funding rate stream connected
[deriv-worker] Liquidation stream connected
[deriv-worker] Whale/OrderFlow stream connected
```

---

### ❌ BAD - Timeout Errors
```
[useMarketData] metals fetch error: TimeoutError: signal timed out
```

### ✅ GOOD - Successful Fetches
```
[useMarketData] metals data loaded successfully
```

---

### ❌ BAD - Type Errors
```
TypeError: Cannot read properties of undefined (reading 'endsWith')
```

### ✅ GOOD - No Type Errors
```
(No errors in console)
```

---

## Performance Metrics

### Target Metrics
- **API Error Rate:** < 0.1%
- **WebSocket Uptime:** > 99.9%
- **Data Fetch Success:** > 99%
- **Client Errors:** 0

### How to Measure

1. **Open Browser DevTools**
2. **Go to Console tab**
3. **Monitor for 10 minutes**
4. **Count errors by type**

---

## Troubleshooting

### If 429 Errors Persist
1. Check client interval (should be 90s)
2. Check server cooldown (should be 75s)
3. Verify Redis is working
4. Check for multiple tabs/windows

### If WebSocket Errors Persist
1. Check network connectivity
2. Verify Binance/Bybit API status
3. Check for firewall/proxy issues
4. Review reconnection logs

### If Timeouts Persist
1. Check Yahoo Finance API status
2. Verify network latency
3. Consider increasing timeout further
4. Check for rate limiting on Yahoo side

### If Type Errors Persist
1. Verify type guards are in place
2. Check for other undefined access
3. Review component props
4. Add additional null checks

---

## Success Indicators

After 10 minutes of monitoring:

✅ **Zero 429 errors**
✅ **Zero WebSocket ping errors**
✅ **Successful data fetches**
✅ **Zero TypeError crashes**
✅ **Smooth user experience**

---

## Escalation

If issues persist after 24 hours:

1. Review `CRITICAL-FIXES-APPLIED.md`
2. Check server logs
3. Verify deployment completed
4. Consider rollback plan
5. Investigate external API status

---

## Quick Commands

### Clear Browser Cache
```
Ctrl+Shift+Delete (Windows/Linux)
Cmd+Shift+Delete (Mac)
```

### Hard Reload
```
Ctrl+Shift+R (Windows/Linux)
Cmd+Shift+R (Mac)
```

### Open DevTools
```
F12 or Ctrl+Shift+I (Windows/Linux)
Cmd+Option+I (Mac)
```

---

**Remember:** Most issues should resolve within 10 minutes of deployment.
