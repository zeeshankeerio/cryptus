# Derivatives Intelligence - Quick Start Guide
**For Developers**: How derivatives data flows through the system  
**Last Updated**: 2026-04-26

---

## 🎯 OVERVIEW

This guide explains how derivatives intelligence flows from data collection to signal generation to user interface.

---

## 📊 DATA FLOW DIAGRAM

```
┌─────────────────────────────────────────────────────────────────┐
│                    BINANCE/BYBIT WEBSOCKETS                      │
│  (Funding Rates, Liquidations, Whale Trades, Agg Trades, OI)   │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│              DERIVATIVES WORKER (derivatives-worker.js)          │
│  • Collects real-time data                                      │
│  • Calculates CVD, Funding History, OI Analysis, Cascade Risk   │
│  • Computes Smart Money Pressure Index                          │
│  • Broadcasts updates to React hooks                            │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│         REACT HOOK (hooks/use-derivatives-intel.ts)              │
│  • Receives worker messages                                     │
│  • Updates React state                                          │
│  • Provides data to components                                  │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│           SIGNAL GENERATION (lib/indicators.ts)                  │
│  • computeStrategyScore() uses Smart Money Score                │
│  • Applies 15% boost if confirms, 20% penalty if contradicts    │
│  • calculateRiskParameters() adjusts SL/TP based on derivatives │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│        SIGNAL NARRATION (lib/signal-narration.ts)                │
│  • generateSignalNarration() adds derivatives context           │
│  • Includes CVD, Funding, OI, Cascade Risk in reasons           │
│  • Adjusts conviction based on derivatives signals              │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│              USER INTERFACE (components/*.tsx)                   │
│  • Signal Narration Modal shows derivatives context             │
│  • Screener Dashboard shows Smart Money Score                   │
│  • Derivatives Dashboard (Phase 4) shows detailed metrics       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔧 KEY FILES & THEIR ROLES

### Data Collection Layer

#### `public/derivatives-worker.js`
**Role**: Collects real-time derivatives data from exchanges  
**Key Functions**:
- `connectFundingRates()` - Binance funding rate stream
- `connectLiquidations()` - Bybit + Binance liquidation streams
- `connectWhaleAlerts()` - Binance aggTrade streams for whale detection
- `updateCVD()` - Calculates cumulative volume delta
- `updateFundingHistory()` - Tracks funding rate trends
- `analyzeOI()` - Analyzes open interest changes
- `predictCascadeRisk()` - Predicts liquidation cascades

**Broadcasts**:
- `FUNDING_UPDATE` - Funding rate data
- `LIQUIDATION` - Individual liquidation events
- `WHALE_TRADE` - Large trade events
- `ORDER_FLOW_UPDATE` - Order flow pressure data
- `OI_UPDATE` - Open interest data
- `CVD_UPDATE` - CVD data (Phase 1)
- `FUNDING_HISTORY_UPDATE` - Funding history (Phase 1)
- `OI_ANALYSIS_UPDATE` - OI analysis (Phase 1)
- `CASCADE_RISK_UPDATE` - Cascade risk (Phase 1)

---

#### `lib/derivatives-types.ts`
**Role**: TypeScript type definitions for all derivatives data  
**Key Types**:
- `FundingRateData` - Current funding rate
- `LiquidationEvent` - Individual liquidation
- `WhaleTradeEvent` - Large trade
- `OrderFlowData` - Buy/sell pressure
- `OpenInterestData` - OI value and changes
- `SmartMoneyPressure` - Composite score
- `CVDData` - Cumulative volume delta (Phase 1)
- `FundingRateHistory` - Historical context (Phase 1)
- `OpenInterestAnalysis` - OI analysis (Phase 1)
- `LiquidationCascadeRisk` - Cascade prediction (Phase 1)

---

#### `lib/smart-money.ts`
**Role**: Calculates Smart Money Pressure Index  
**Key Functions**:
- `computeFundingSignal()` - Funding rate signal (-100 to +100)
- `computeLiquidationSignal()` - Liquidation imbalance signal
- `computeWhaleSignal()` - Whale trade direction signal
- `computeOrderFlowSignal()` - Order flow pressure signal
- `computeCVDSignal()` - CVD signal (Phase 1)
- `computeSmartMoneyPressure()` - Composite score

**Weights**:
- Funding: 45% (was 50%, reduced to make room for CVD)
- Liquidation: 25%
- Whale: 15%
- Order Flow: 5% (was 10%)
- CVD: 10% (NEW in Phase 1)

---

### React Integration Layer

#### `hooks/use-derivatives-intel.ts`
**Role**: React hook that connects worker to components  
**Key Functions**:
- `useDerivativesIntel()` - Main hook for all derivatives data
- `useSymbolDerivatives()` - Lightweight hook for single symbol

**Returns**:
- `fundingRates` - Map of funding rates by symbol
- `liquidations` - Array of recent liquidations
- `whaleAlerts` - Array of recent whale trades
- `orderFlow` - Map of order flow data by symbol
- `openInterest` - Map of OI data by symbol
- `smartMoney` - Map of Smart Money scores by symbol
- `isConnected` - Worker connection status
- `isStale` - Data freshness indicator

---

### Signal Generation Layer

#### `lib/indicators.ts`
**Role**: Calculates strategy scores and risk parameters  
**Key Functions**:
- `computeStrategyScore()` - Main scoring function
  - Uses `smartMoneyScore` for confirmation/contradiction
  - Applies 15% boost if confirms, 20% penalty if contradicts
- `calculateRiskParameters()` - Calculates SL/TP
  - Will be enhanced in Phase 2 with derivatives adjustments

**Smart Money Integration** (lines 986-1009):
```typescript
if (Math.abs(smartMoneyScore) >= 30) {
  const smDirection = smartMoneyScore > 0 ? 'bullish' : 'bearish';
  
  if (smDirection === scoreDirection) {
    score *= 1.15;  // 15% boost
    reasons.push(`🐋 Smart Money confirms`);
  } else {
    score *= 0.80;  // 20% penalty
    reasons.push(`⚠ Smart Money contradicts`);
  }
}
```

---

#### `lib/signal-narration.ts`
**Role**: Generates human-readable signal explanations  
**Key Functions**:
- `generateSignalNarration()` - Main narration function
  - Analyzes all indicators
  - Composes headline and reasons
  - Calculates conviction score

**Smart Money Integration** (lines 355-368):
```typescript
const sms = (entry as any).smartMoneyScore;
if (sms != null && Math.abs(sms) >= 30) {
  if (sms > 0) {
    reasons.push(`🐳 Smart Money Flow: +${sms} - Derivatives data confirms bullish institutional positioning`);
    bullishPoints += 8;
  } else {
    reasons.push(`🐳 Smart Money Flow: ${sms} - Derivatives data signals net institutional selling pressure`);
    bearishPoints += 8;
  }
  totalPoints += 8;
  pillars.liquidity = true;
}
```

**Phase 2 Enhancements** (to be added):
- CVD integration (lines ~370-385)
- Funding rate historical context (lines ~387-410)
- OI analysis integration (lines ~412-430)
- Liquidation cascade risk (lines ~432-450)

---

### User Interface Layer

#### `components/signal-narration-modal.tsx`
**Role**: Displays signal analysis with derivatives context  
**Key Sections**:
- Header: Shows Smart Money Score badge
- Institutional Zones & Flow: Shows demand/supply zones
- Signal DNA: Shows OBV, momentum, candle profile

**Phase 4 Enhancements** (to be added):
- Derivatives section with CVD, funding, OI, cascade risk
- Whale activity feed
- Liquidation heatmap visualization

---

#### `components/screener-dashboard.tsx`
**Role**: Main screener interface  
**Derivatives Integration**:
- Uses `useDerivativesIntel()` hook
- Passes `smartMoneyScore` to `computeStrategyScore()`
- Displays Smart Money badge in screener cards

---

## 🚀 PHASE 1 IMPLEMENTATION CHECKLIST

### Week 1: Data Collection

- [ ] **Task 1.1**: Create `lib/cvd-calculator.ts`
  - [ ] Implement `updateCVD()` function
  - [ ] Implement `getCVDData()` function
  - [ ] Implement `getAllCVD()` function
  - [ ] Add unit tests

- [ ] **Task 1.2**: Create `lib/funding-history.ts`
  - [ ] Implement `updateFundingHistory()` function
  - [ ] Implement `getFundingHistory()` function
  - [ ] Add unit tests

- [ ] **Task 1.3**: Create `lib/oi-analyzer.ts`
  - [ ] Implement `updateOIHistory()` function
  - [ ] Implement `analyzeOI()` function
  - [ ] Add unit tests

- [ ] **Task 1.4**: Create `lib/cascade-predictor.ts`
  - [ ] Implement `predictCascadeRisk()` function
  - [ ] Add unit tests

- [ ] **Task 1.5**: Update `lib/derivatives-types.ts`
  - [ ] Add `CVDData` interface
  - [ ] Add `FundingRateHistory` interface
  - [ ] Add `OpenInterestAnalysis` interface
  - [ ] Add `LiquidationCascadeRisk` interface
  - [ ] Update `DerivativesState` interface
  - [ ] Update `DerivativesWorkerMessage` type

- [ ] **Task 1.6**: Update `public/derivatives-worker.js`
  - [ ] Import CVD calculator
  - [ ] Import funding history tracker
  - [ ] Import OI analyzer
  - [ ] Import cascade predictor
  - [ ] Add CVD state and update logic
  - [ ] Add funding history state and update logic
  - [ ] Add OI analysis state and update logic
  - [ ] Add cascade risk state and update logic
  - [ ] Add broadcast messages for new data

- [ ] **Task 1.7**: Update `lib/smart-money.ts`
  - [ ] Add `computeCVDSignal()` function
  - [ ] Update `WEIGHTS` to include CVD (10%)
  - [ ] Update `computeSmartMoneyPressure()` to include CVD

### Week 2: Testing & Deployment

- [ ] **Task 2.1**: Integration Testing
  - [ ] Test CVD calculation accuracy
  - [ ] Test funding history tracking
  - [ ] Test OI analysis calculations
  - [ ] Test cascade prediction logic
  - [ ] Test worker message broadcasting
  - [ ] Test React hook updates

- [ ] **Task 2.2**: Performance Testing
  - [ ] Measure CVD calculation performance (<10ms)
  - [ ] Measure memory usage (<200MB)
  - [ ] Measure worker message frequency
  - [ ] Optimize if needed

- [ ] **Task 2.3**: Deploy to Staging
  - [ ] Deploy worker changes
  - [ ] Deploy library changes
  - [ ] Test on staging environment
  - [ ] Fix any bugs

- [ ] **Task 2.4**: Deploy to Production
  - [ ] Deploy with feature flag
  - [ ] Enable for 10% of users
  - [ ] Monitor metrics
  - [ ] Gradual rollout to 100%

---

## 📊 MONITORING & DEBUGGING

### Key Metrics to Monitor

#### Worker Performance
- **CVD Calculation Time**: <10ms per update
- **Funding History Update Time**: <5ms per update
- **OI Analysis Time**: <8ms per update
- **Cascade Prediction Time**: <15ms per update
- **Total Worker Memory**: <200MB
- **Message Broadcast Frequency**: ~400ms (2.5 Hz)

#### Data Quality
- **CVD Accuracy**: >95% (compare with exchange data)
- **Funding History Accuracy**: >98%
- **OI Analysis Accuracy**: >92%
- **Cascade Prediction Accuracy**: >85%

#### Business Metrics
- **Signal Accuracy Improvement**: +25-30% (target)
- **False Signal Reduction**: -20-25% (target)
- **User Engagement**: +15-20% (target)

### Debugging Tips

#### Worker Not Broadcasting Updates
1. Check browser console for worker errors
2. Check worker connection status: `derivativesWorker.postMessage({ type: 'HEALTH_CHECK' })`
3. Check WebSocket connections in Network tab
4. Verify symbols are being tracked: `derivativesWorker.postMessage({ type: 'GET_SYMBOLS' })`

#### CVD Data Not Updating
1. Check if aggTrade stream is connected
2. Verify `updateCVD()` is being called in aggTrade handler
3. Check CVD state in worker: `console.log(cvdStates)`
4. Verify CVD broadcast is happening in flush function

#### Smart Money Score Not Changing
1. Check if CVD signal is being calculated
2. Verify CVD weight is applied in `computeSmartMoneyPressure()`
3. Check if CVD data is reaching React hook
4. Verify Smart Money recomputation is triggered

---

## 🎯 QUICK REFERENCE

### Adding a New Derivatives Metric

1. **Define Type** in `lib/derivatives-types.ts`:
```typescript
export interface MyNewMetric {
  symbol: string;
  value: number;
  updatedAt: number;
}
```

2. **Create Calculator** in `lib/my-new-metric.ts`:
```typescript
export function calculateMyNewMetric(symbol: string, data: any): MyNewMetric {
  // Calculation logic
  return { symbol, value, updatedAt: Date.now() };
}
```

3. **Integrate in Worker** in `public/derivatives-worker.js`:
```javascript
// Add state
let myNewMetricState = new Map();

// Add update logic
function updateMyNewMetric(symbol, data) {
  const metric = calculateMyNewMetric(symbol, data);
  myNewMetricState.set(symbol, metric);
}

// Add broadcast
function flush() {
  // ... existing code ...
  broadcast({
    type: 'MY_NEW_METRIC_UPDATE',
    payload: Array.from(myNewMetricState.entries())
  });
}
```

4. **Update Hook** in `hooks/use-derivatives-intel.ts`:
```typescript
const [myNewMetric, setMyNewMetric] = useState<Map<string, MyNewMetric>>(new Map());

// In handleMessage:
case 'MY_NEW_METRIC_UPDATE': {
  const entries = payload as [string, MyNewMetric][];
  setMyNewMetric(new Map(entries));
  break;
}

// In return:
return {
  // ... existing returns ...
  myNewMetric,
};
```

5. **Use in Signal Generation** in `lib/signal-narration.ts`:
```typescript
if (entry.myNewMetric && entry.myNewMetric.value > threshold) {
  reasons.push(`📊 My New Metric: ${entry.myNewMetric.value} - interpretation`);
  bullishPoints += 10;
  totalPoints += 10;
  pillars.liquidity = true;
}
```

---

## 📞 SUPPORT & RESOURCES

### Documentation
- **Full Analysis**: `DERIVATIVES_INTELLIGENCE_DEEP_ANALYSIS.md`
- **Integration Analysis**: `DERIVATIVES_INTELLIGENCE_SIGNAL_INTEGRATION_ANALYSIS.md`
- **Complete Roadmap**: `DERIVATIVES_INTELLIGENCE_COMPLETE_ROADMAP.md`
- **Phase 1 Guide**: `DERIVATIVES_PHASE1_IMPLEMENTATION_GUIDE.md`

### Code References
- **Worker**: `public/derivatives-worker.js`
- **Types**: `lib/derivatives-types.ts`
- **Smart Money**: `lib/smart-money.ts`
- **Hook**: `hooks/use-derivatives-intel.ts`
- **Strategy Scoring**: `lib/indicators.ts` (lines 986-1009)
- **Signal Narration**: `lib/signal-narration.ts` (lines 355-368)

### Testing
- **Unit Tests**: `lib/__tests__/strategy-scoring.test.ts`
- **Integration Tests**: TBD (Phase 1)
- **Performance Tests**: TBD (Phase 1)

---

**Last Updated**: 2026-04-26  
**Version**: 1.0  
**Status**: Ready for Phase 1 Implementation
