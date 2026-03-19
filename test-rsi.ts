import { calculateRsi, calculateRsiWithState, approximateRsi } from './lib/rsi';

async function fetchBybitKlines(symbol: string, interval: string, limit: number): Promise<number[][]> {
  const url = `https://api.bybit.com/v5/market/kline?category=spot&symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const response = await fetch(url);
  const data = await response.json();
  const rows = data.result.list;
  rows.reverse(); // Newest first to oldest first
  return rows.map((row: string[]) => [
    parseInt(row[0], 10), // timestamp
    parseFloat(row[1]), // open
    parseFloat(row[2]), // high
    parseFloat(row[3]), // low
    parseFloat(row[4]), // close
    parseFloat(row[5]), // volume
  ]);
}

async function testRsi() {
  const symbol = 'BTCUSDT';
  console.log(`\n===========================================`);
  console.log(`Testing RSI against Bybit Live Data for ${symbol}`);
  console.log(`===========================================\n`);

  // 1. Fetch 1m Klines (limit 1000)
  const klines1m = await fetchBybitKlines(symbol, '1', 1000);
  const closes1m = klines1m.map(k => k[4]);
  
  // The last kline is the CURRENT forming candle.
  const unclosedPrice = closes1m[closes1m.length - 1];
  console.log(`Live 1m Price (Unclosed Candle): $${unclosedPrice}`);

  // Base RSI using all closes (including unclosed) - Static Fetch Match
  const rsi1mStatic = calculateRsi(closes1m, 14);
  console.log(`Static 1m RSI (Calculated with all closes): ${rsi1mStatic}`);

  // RSI State using calculateRsiWithState (should exclude the unclosed candle)
  const state1m = calculateRsiWithState(closes1m, 14);
  if (!state1m) {
    console.error("Not enough data for state.");
    return;
  }
  
  console.log(`\nState snapshot (from completely closed candles):`);
  console.log(`- Last Closed Price: $${state1m.lastClose}`);
  console.log(`- AvgGain: ${state1m.avgGain.toFixed(6)}`);
  console.log(`- AvgLoss: ${state1m.avgLoss.toFixed(6)}`);

  // Approximate RSI using the state + live price
  const approximatedRsi1m = approximateRsi(state1m, unclosedPrice, 14);
  console.log(`\nApproximated Real-Time 1m RSI with live price $${unclosedPrice}: ${approximatedRsi1m}`);
  
  const diff = Math.abs((rsi1mStatic ?? 0) - approximatedRsi1m);
  console.log(`Difference (Static vs Approximated): ${diff.toFixed(6)}`);
  if (diff < 0.01) {
    console.log(`✅ EXACT MATCH! The real-time approximation perfectly aligns with standard calculation!`);
  } else {
    console.error(`❌ DIFFERENCE DETECTED! The real-time approximation logic is off.`);
  }

  // Next live tick test (simulate a new WebSocket update without closing candle)
  const simulatedTick = unclosedPrice + 15.5; // price moves up
  const rsiNextTick = approximateRsi(state1m, simulatedTick, 14);
  
  console.log(`\n--- Real-Time Tick Simulation ---`);
  console.log(`Simulating price moving to $${simulatedTick}`);
  console.log(`New Approximated RSI: ${rsiNextTick}`);

  // We test if calculation holds up: If we swap the last close in the array to the simulated tick, it should match
  const simulatedCloses = [...closes1m];
  simulatedCloses[simulatedCloses.length - 1] = simulatedTick;
  const staticNextTick = calculateRsi(simulatedCloses, 14);
  
  const diffNext = Math.abs((staticNextTick ?? 0) - rsiNextTick);
  if (diffNext < 0.01) {
    console.log(`✅ TICK MATCH! Real-time WS tick approximation perfectly matches full recalculation!`);
  } else {
    console.error(`❌ TICK DIFFERENCE DETECTED! ${staticNextTick} vs ${rsiNextTick}`);
  }

  // 1h timeframe
  console.log(`\n--- 1h Timeframe Test ---`);
  const klines1h = await fetchBybitKlines(symbol, '60', 200);
  const closes1h = klines1h.map(k => k[4]);
  const rsi1hStatic = calculateRsi(closes1h, 14);
  const state1h = calculateRsiWithState(closes1h, 14);
  if (state1h) {
      const approx1h = approximateRsi(state1h, closes1h[closes1h.length - 1], 14);
      console.log(`1h Static RSI: ${rsi1hStatic} | Approximated 1h RSI: ${approx1h}`);
      if (Math.abs((rsi1hStatic ?? 0) - approx1h) < 0.01) {
          console.log(`✅ 1h MATCH PERFECT! History limit of 200 properly stabilizes calculation.`);
      }
  }

}

testRsi().catch(console.error);
