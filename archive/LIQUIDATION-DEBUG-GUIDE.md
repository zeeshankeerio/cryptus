# Liquidation Data Debugging Guide

## Issue: No liquidation data showing in Derivatives Intelligence panel

---

## Quick Diagnostic Steps

### 1. Open Browser Console (F12)

Check for these messages:

```javascript
// ✅ GOOD - Worker is running
[deriv-worker] Starting derivatives intelligence engine...
[deriv-worker] Liquidation stream connected (Bybit Linear)
[deriv-worker] Liquidation stream connected (Binance Futures)

// ❌ BAD - Connection issues
WebSocket connection failed
[deriv-worker] Liquidation stream closed
```

### 2. Check Stream Health

In console, type:
```javascript
// Check if derivatives worker is connected
// Should show streamHealth with liquidationBybit and liquidationBinance as true
```

### 3. Check Liquidation Threshold

The default threshold is **$10,000 USD**. Liquidations below this are filtered out.

To see ALL liquidations (for testing), run in console:
```javascript
// Lower threshold to $1000 for testing
// Note: This will show many small liquidations
```

---

## Common Issues & Fixes

### Issue 1: Threshold Too High

**Problem:** Default $10K threshold filters out most liquidations during low volatility

**Solution:** Temporarily lower threshold for testing

**How to fix:**
1. Open `public/derivatives-worker.js`
2. Find: `let LIQUIDATION_THRESHOLD = 10000;`
3. Change to: `let LIQUIDATION_THRESHOLD = 1000;` (for testing)
4. Rebuild and refresh

**Or dynamically in console:**
```javascript
// This requires adding a config update mechanism
```

---

### Issue 2: Symbol Not Being Tracked

**Problem:** Liquidations only show for symbols in `WHALE_WATCH_SYMBOLS` or currently viewed symbols

**Current tracked symbols:**
```javascript
const WHALE_WATCH_SYMBOLS = [
  'btcusdt', 'ethusdt', 'solusdt', 'bnbusdt', 'xrpusdt',
  'dogeusdt', 'adausdt', 'avaxusdt', 'dotusdt', 'maticusdt',
  'linkusdt', 'ltcusdt', 'uniusdt', 'atomusdt', 'nearusdt',
  'aptusdt', 'arbusdt', 'opusdt', 'suiusdt', 'pepeusdt'
];
```

**Solution:** 
- View the symbol you want to track in the screener
- Or add it to WHALE_WATCH_SYMBOLS in derivatives-worker.js

---

### Issue 3: WebSocket Connection Failed

**Problem:** Binance/Bybit WebSocket streams not connecting

**Check:**
1. Network tab in DevTools
2. Look for WebSocket connections to:
   - `wss://stream.bybit.com/v5/public/linear`
   - `wss://fstream.binance.com/ws/!forceOrder@arr`

**Possible causes:**
- Firewall blocking WebSocket connections
- VPN/Proxy interference
- Exchange API temporarily down
- Too many concurrent connections

**Solution:**
- Check browser console for specific error messages
- Try disabling VPN/proxy
- Wait a few minutes and refresh (auto-reconnect will trigger)

---

### Issue 4: Worker Not Starting

**Problem:** Derivatives worker not initializing

**Check console for:**
```javascript
[DerivativesIntel] Worker created
[deriv-worker] Derivatives Intelligence Worker loaded
[deriv-worker] Starting derivatives intelligence engine...
```

**If missing:**
1. Check if `public/derivatives-worker.js` exists
2. Verify no JavaScript errors blocking worker creation
3. Check browser supports Web Workers
4. Try hard refresh (Ctrl+Shift+R)

---

### Issue 5: Data Received But Not Displayed

**Problem:** Worker receiving data but UI not updating

**Debug steps:**

1. Check if liquidations array is populated:
```javascript
// In React DevTools, find DerivativesPanel component
// Check props.liquidations - should be an array
```

2. Check if component is filtering liquidations:
```javascript
// In derivatives-panel.tsx, check sortedLiquidations
// May be filtered by selectedSymbol or time range
```

3. Check if "All Symbols" is selected:
- The panel may be filtered to a specific symbol
- Click "All Symbols" to see all liquidations

---

## Testing Liquidation Data

### Method 1: Wait for Real Liquidations

During high volatility (especially during:
- Major news events
- Large price moves (>5% in 1 hour)
- Funding rate collection times (every 8 hours)

You should see liquidations within 5-10 minutes.

### Method 2: Lower Threshold Temporarily

Edit `public/derivatives-worker.js`:

```javascript
// Change from:
let LIQUIDATION_THRESHOLD = 10000;

// To:
let LIQUIDATION_THRESHOLD = 1000; // $1K threshold for testing
```

This will show many more liquidations (including smaller retail positions).

### Method 3: Check Specific High-Volume Symbols

Liquidations are most common on:
- BTCUSDT (Bitcoin)
- ETHUSDT (Ethereum)
- High-leverage altcoins during pumps/dumps

Make sure these symbols are visible in your screener.

---

## Expected Behavior

### Normal Market Conditions
- 0-5 liquidations per minute
- Mostly $10K-$50K size
- Mix of longs and shorts

### High Volatility
- 10-50+ liquidations per minute
- Many $50K-$500K+ size
- Cascade liquidations (same direction)

### Low Volatility / Sideways Market
- May see NO liquidations for 10-30 minutes
- This is NORMAL - not a bug

---

## Verification Checklist

Run through this checklist:

- [ ] Browser console shows worker loaded
- [ ] WebSocket connections established (check Network tab)
- [ ] No WebSocket errors in console
- [ ] streamHealth shows liquidationBybit: true
- [ ] streamHealth shows liquidationBinance: true
- [ ] Viewing crypto symbols (not forex/metals)
- [ ] "All Symbols" selected in derivatives panel
- [ ] Waited at least 5 minutes during market hours
- [ ] Market is volatile enough to generate liquidations

---

## Advanced Debugging

### Enable Verbose Logging

Add to `public/derivatives-worker.js` in the liquidation message handler:

```javascript
liquidationWs.onmessage = (event) => {
  try {
    const data = JSON.parse(event.data);
    console.log('[DEBUG] Bybit liquidation raw:', data); // ADD THIS
    lastDataReceived = Date.now();
    // ... rest of code
```

This will show ALL liquidation events received, even if filtered out.

### Check Liquidation Buffer

In browser console:
```javascript
// This won't work directly, but you can add a debug message
// in the worker to broadcast buffer size periodically
```

### Monitor WebSocket Messages

1. Open DevTools → Network tab
2. Filter by "WS" (WebSocket)
3. Click on the Bybit/Binance connection
4. Watch "Messages" tab
5. You should see liquidation events flowing in real-time

---

## Quick Fix: Force Reconnect

If streams seem stuck, force a reconnect:

1. Switch to another tab
2. Wait 10 seconds
3. Switch back

The visibility handler will trigger a RESUME message and reconnect if needed.

Or refresh the page (Ctrl+R).

---

## Still Not Working?

### Check External Services

1. **Bybit API Status:** https://bybit-exchange.github.io/docs/v5/ws/connect
2. **Binance API Status:** https://www.binance.com/en/support/announcement

If exchanges are having issues, liquidation data won't be available.

### Check Browser Compatibility

Web Workers and WebSockets required:
- Chrome 88+
- Firefox 85+
- Safari 14+
- Edge 88+

### Check Network

- Corporate firewall may block WebSocket connections
- Some VPNs interfere with WebSocket streams
- Try from a different network

---

## Success Indicators

You'll know it's working when you see:

✅ Console shows: `[deriv-worker] Liquidation stream connected`
✅ Network tab shows active WebSocket connections
✅ During volatile moves, liquidations appear in panel
✅ Liquidation count increases over time
✅ Toast notifications for large liquidations ($50K+)

---

## Contact

If issue persists after following this guide:
1. Check console for specific error messages
2. Verify WebSocket connections in Network tab
3. Confirm market is volatile enough to generate liquidations
4. Try lowering threshold temporarily for testing

**Remember:** No liquidations during low volatility is NORMAL, not a bug!
