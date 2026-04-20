# Design Document: RSI Screener UI/UX Improvements

## Overview

This design document outlines the technical architecture for enhancing the RSI Screener UI to expose advanced features that are already implemented in the backend. The design focuses on creating reusable, performant UI components that integrate seamlessly with existing hooks and utilities without degrading performance.

## Architecture Principles

1. **Zero New Backend Logic** - All features leverage existing backend functions
2. **Component Reusability** - Create atomic, composable UI components
3. **Performance First** - Memoization, lazy loading, and efficient re-renders
4. **Mobile Responsive** - Touch-friendly, bottom sheets, condensed views
5. **Progressive Enhancement** - Core functionality works, advanced features enhance

## Component Architecture

### 1. Win Rate Display System

**Components:**
- `WinRateBadge` - Inline badge showing win rate percentage
- `WinRateTooltip` - Hover tooltip with detailed stats
- `GlobalWinRateBadge` - Header badge for system-wide win rate

**State Management:**
```typescript
interface WinRateState {
  symbolStats: Map<string, WinRateStats>; // From computeWinRateStats()
  globalStats: GlobalWinRate; // From getGlobalWinRate()
  lastUpdate: number;
}
```

**Integration:**
- Hook into existing `signal-tracker.ts` functions
- Update every 30s using `useEffect` with interval
- Memoize stats computation with `useMemo`

**Implementation Location:**
- Add to `ScreenerRow` component in `screener-dashboard.tsx`
- Add `GlobalWinRateBadge` to header section

---

### 2. Conditional Alert Creation Interface

**Components:**
- `ConditionalAlertBuilder` - Main builder interface
- `ConditionRow` - Single condition editor
- `LogicToggle` - AND/OR selector
- `ConditionTypeSelect` - Dropdown for condition types
- `OperatorSelect` - Dropdown for operators
- `ValueInput` - Numeric input with validation

**State Management:**
```typescript
interface ConditionalAlertState {
  logic: 'AND' | 'OR';
  conditions: AlertCondition[]; // Max 5
  errors: string[];
  isValid: boolean;
}
```

**Integration:**
- Use `validateConditionalConfig()` from `conditional-alerts.ts`
- Save to `coinConfig` via existing `updateCoinConfig()`
- Display in symbol settings modal

**Implementation Location:**
- New section in symbol settings modal
- Add to `CoinConfigModal` or create `ConditionalAlertsSection`

---

### 3. Push Notification Onboarding Flow

**Components:**
- `PushNotificationWizard` - Multi-step modal
- `WizardStep` - Individual step component
- `PermissionExplainer` - Step 1: Benefits explanation
- `PermissionPrompt` - Step 2: Browser permission
- `SuccessConfirmation` - Step 3: Test notification

**State Management:**
```typescript
interface OnboardingState {
  currentStep: 1 | 2 | 3;
  hasSeenOnboarding: boolean; // localStorage
  pushStatus: PushStatus; // From usePushNotifications
}
```

**Integration:**
- Use existing `usePushNotifications()` hook
- Show modal on first visit (check localStorage)
- Add "Send Test Notification" button to settings

**Implementation Location:**
- New `PushNotificationWizard` component
- Trigger from `ScreenerDashboard` on mount
- Add controls to global settings panel

---

### 4. Quiet Hours Configuration UI

**Components:**
- `QuietHoursSection` - Main configuration section
- `TimeRangePicker` - Start/end hour selectors
- `QuietHoursTimeline` - Visual 24-hour clock
- `QuietBadge` - Badge for symbols with active quiet hours

**State Management:**
```typescript
interface QuietHoursConfig {
  enabled: boolean;
  startHour: number; // 0-23
  endHour: number; // 0-23
}
```

**Integration:**
- Save to `coinConfig.quietHoursEnabled`, `quietHoursStart`, `quietHoursEnd`
- Backend uses existing `shouldSuppressAlert()` function
- Display `QuietBadge` in symbol cell when active

**Implementation Location:**
- Add to symbol settings modal
- Add `QuietBadge` to `SymbolCell` component

---

### 5. Enhanced Alert History Panel

**Components:**
- `AlertHistoryPanel` - Main panel component
- `AlertHistoryRow` - Individual alert row
- `AlertFilters` - Filter controls (type, date range)
- `AlertDetailModal` - Detailed view with narration
- `OutcomeBadge` - Win/loss indicator

**State Management:**
```typescript
interface AlertHistoryState {
  alerts: Alert[]; // From useAlertEngine
  filters: {
    types: AlertType[];
    dateRange: [Date, Date];
  };
  selectedAlert: Alert | null;
}
```

**Integration:**
- Use `alerts` from `useAlertEngine()` hook
- Match alerts with signal snapshots from `signal-tracker.ts`
- Display signal narration from `generateSignalNarration()`

**Implementation Location:**
- Enhance existing alert panel in `ScreenerDashboard`
- Add filter controls and detail modal

---

### 6. Signal Tracker Dashboard

**Components:**
- `SignalTrackerDashboard` - Main dashboard
- `SignalStatsTable` - Sortable table of symbols
- `GlobalStatsCard` - Summary statistics card
- `SignalDetailView` - Individual signal breakdown
- `ClearDataButton` - Reset tracking with confirmation

**State Management:**
```typescript
interface SignalTrackerState {
  stats: WinRateStats[]; // From computeWinRateStats()
  sortKey: keyof WinRateStats;
  sortDir: 'asc' | 'desc';
  minSignalCount: number;
  selectedSymbol: string | null;
}
```

**Integration:**
- Use `computeWinRateStats()` and `getGlobalWinRate()`
- Update every 30s with `useEffect` interval
- Call `clearSignalTracker()` on reset

**Implementation Location:**
- New tab/panel in main navigation
- Accessible from header or sidebar

---

### 7. Derivatives Intelligence Integration

**Components:**
- `FundingRateCell` - Funding rate display
- `OrderFlowIndicator` - Buy/sell pressure indicator
- `LiquidationBadge` - Large liquidation alert
- `DerivativesTooltip` - Detailed breakdown on hover

**State Management:**
```typescript
interface DerivativesState {
  fundingRates: Map<string, FundingRate>;
  orderFlow: Map<string, OrderFlowData>;
  liquidations: LiquidationEvent[];
  smartMoney: Map<string, SmartMoneyScore>;
}
```

**Integration:**
- Use existing `useDerivativesIntel()` hook
- Add columns to screener table
- Toggle visibility in column settings

**Implementation Location:**
- Add cells to `ScreenerRow` component
- Add column toggles to `OPTIONAL_COLUMNS`

---

### 8. Alert Priority and Sound Customization UI

**Components:**
- `PrioritySelector` - Dropdown with explanations
- `SoundSelector` - Dropdown with preview button
- `SoundPreviewButton` - Play sound sample
- `PriorityBadge` - Visual indicator on symbols

**State Management:**
```typescript
interface AlertCustomizationState {
  priority: AlertPriority; // 'low' | 'medium' | 'high' | 'critical'
  sound: string; // 'default' | 'soft' | 'urgent' | 'bell' | 'ping'
}
```

**Integration:**
- Save to `coinConfig.priority` and `coinConfig.sound`
- Backend uses `getAlertBehavior()` to apply settings
- Display `PriorityBadge` in symbol cell

**Implementation Location:**
- Add to symbol settings modal
- Add `PriorityBadge` to `SymbolCell` component

---

### 9. Global Win Rate Badge

**Component:**
- `GlobalWinRateBadge` - Header badge with tooltip

**State Management:**
```typescript
interface GlobalWinRateState {
  winRate15m: number;
  winRate5m: number;
  winRate1h: number;
  totalSignals: number;
  color: 'green' | 'yellow' | 'red' | 'gray';
}
```

**Integration:**
- Use `getGlobalWinRate()` from `signal-tracker.ts`
- Update every 30s
- Color coding based on thresholds

**Implementation Location:**
- Add to header section in `ScreenerDashboard`
- Position near user profile or navigation

---

### 10. Advanced Feature Discoverability

**Components:**
- `FeaturesPanel` - Main discovery panel
- `FeatureCard` - Individual feature card
- `FeatureModal` - Detailed explanation modal
- `FeatureBadge` - Notification badge for unused features

**State Management:**
```typescript
interface FeatureDiscoveryState {
  usedFeatures: Set<string>; // localStorage
  showPanel: boolean;
  selectedFeature: string | null;
}
```

**Integration:**
- Track feature usage in localStorage
- Show badge count on "Features" menu item
- Navigate to relevant settings on "Try It Now"

**Implementation Location:**
- New panel accessible from header
- Add menu item to navigation

---

### 11. Mobile-Optimized Alert Controls

**Components:**
- `MobileBottomSheet` - Drawer for symbol settings
- `MobileFAB` - Floating action button
- `MobileContextMenu` - Long-press menu
- `TouchFriendlyInput` - Large touch targets

**State Management:**
```typescript
interface MobileState {
  isMobile: boolean; // window.innerWidth < 768
  showBottomSheet: boolean;
  contextMenuSymbol: string | null;
}
```

**Integration:**
- Detect mobile with `useIsMobile()` hook
- Replace modals with bottom sheets on mobile
- Add long-press handlers to symbol rows

**Implementation Location:**
- Conditional rendering in `ScreenerDashboard`
- Mobile-specific components in separate files

---

### 12. Signal Narration Display

**Components:**
- `SignalNarrationButton` - "Why?" info button
- `SignalNarrationModal` - Modal with narration
- `CopyBriefButton` - Copy to clipboard button

**State Management:**
```typescript
interface SignalNarrationState {
  showModal: boolean;
  selectedEntry: ScreenerEntry | null;
  narration: SignalNarration | null;
}
```

**Integration:**
- Use existing `generateSignalNarration()` function
- Display in modal or popover
- Copy formatted text to clipboard

**Implementation Location:**
- Add button to strategy badge in `ScreenerRow`
- Create `SignalNarrationModal` component

---

### 13. Bulk Alert Configuration

**Components:**
- `BulkActionsToolbar` - Floating action bar
- `BulkActionButton` - Trigger bulk mode
- `BulkConfirmationDialog` - Confirm changes
- `SelectionCheckbox` - Row selection checkbox

**State Management:**
```typescript
interface BulkActionState {
  bulkMode: boolean;
  selectedSymbols: Set<string>;
  pendingAction: BulkAction | null;
}
```

**Integration:**
- Use existing `updateCoinConfig()` for batch updates
- Show confirmation with affected symbols
- Display success toast with count

**Implementation Location:**
- Add toolbar to screener header
- Add checkboxes to `ScreenerRow`

---

### 14. Alert Template System UI

**Components:**
- `TemplateManager` - Main template management UI
- `TemplateList` - List of saved templates
- `TemplateEditor` - Create/edit template
- `TemplatePreview` - Preview changes before applying

**State Management:**
```typescript
interface TemplateState {
  templates: AlertTemplate[];
  selectedTemplate: AlertTemplate | null;
  isEditing: boolean;
}
```

**Integration:**
- Persist templates to database (new `AlertTemplate` model)
- Apply template settings to `coinConfig`
- Provide default templates

**Implementation Location:**
- New section in global settings
- Accessible from symbol settings

---

### 15. Performance Metrics Dashboard

**Components:**
- `PerformanceDashboard` - Main metrics dashboard
- `MetricsCard` - Individual metric card
- `WinRateTrendChart` - Time-series chart
- `HourlyHeatmap` - Hour-of-day heatmap
- `ExportButton` - Export to CSV

**State Management:**
```typescript
interface PerformanceState {
  metrics: PerformanceMetrics;
  filters: {
    symbol?: string;
    timeframe?: string;
    alertType?: string;
    priority?: string;
  };
  chartView: 'daily' | 'weekly' | 'monthly';
}
```

**Integration:**
- Compute from alert history and signal snapshots
- Generate recommendations based on patterns
- Export data as CSV

**Implementation Location:**
- Tab in Signal Tracker Dashboard
- Accessible from main navigation

---

## State Management Strategy

### Global State (React Context)
```typescript
interface ScreenerGlobalState {
  // Win Rate Tracking
  winRateStats: Map<string, WinRateStats>;
  globalWinRate: GlobalWinRate;
  
  // Alert History
  alerts: Alert[];
  alertFilters: AlertFilters;
  
  // Feature Discovery
  usedFeatures: Set<string>;
  
  // Bulk Actions
  bulkMode: boolean;
  selectedSymbols: Set<string>;
  
  // Templates
  templates: AlertTemplate[];
}
```

### Local Component State
- Use `useState` for UI-only state (modals, dropdowns)
- Use `useRef` for non-reactive values (intervals, timers)
- Use `useMemo` for expensive computations
- Use `useCallback` for stable function references

### Performance Optimizations
1. **Memoization** - Wrap expensive components with `memo()`
2. **Lazy Loading** - Use `React.lazy()` for heavy dashboards
3. **Virtual Scrolling** - For long lists (alert history, signal tracker)
4. **Debouncing** - For search and filter inputs
5. **Intersection Observer** - For viewport-aware rendering

---

## Integration Points

### Existing Hooks
- `useAlertEngine()` - Alert state and controls
- `usePushNotifications()` - Push notification management
- `useDerivativesIntel()` - Derivatives data
- `useSymbolPrice()` - Real-time price updates

### Existing Utilities
- `signal-tracker.ts` - Win rate computation
- `conditional-alerts.ts` - Alert evaluation
- `alert-priority.ts` - Priority behavior
- `coin-config.ts` - Configuration persistence
- `generateSignalNarration()` - Signal explanations

### Database Models (New)
```prisma
model AlertTemplate {
  id          String   @id @default(cuid())
  userId      String
  name        String
  description String?
  config      Json     // Alert configuration
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  @@unique([userId, name])
}
```

---

## Mobile Responsiveness

### Breakpoints
- Mobile: < 768px
- Tablet: 768px - 1024px
- Desktop: > 1024px

### Mobile Patterns
1. **Bottom Sheets** - Replace modals with slide-up drawers
2. **Touch Targets** - Minimum 44x44px for all interactive elements
3. **Condensed Views** - Hide non-essential columns
4. **Floating Actions** - FAB for quick access to settings
5. **Swipe Gestures** - Swipe to delete, pull to refresh

### Responsive Components
```typescript
const isMobile = useIsMobile(); // Custom hook

return isMobile ? (
  <MobileBottomSheet />
) : (
  <DesktopModal />
);
```

---

## Performance Considerations

### Rendering Optimization
1. **Virtualization** - Use `react-window` for long lists
2. **Memoization** - Wrap components with `React.memo()`
3. **Lazy Loading** - Split code with `React.lazy()`
4. **Debouncing** - Debounce search/filter inputs
5. **Throttling** - Throttle scroll/resize handlers

### Data Fetching
1. **Caching** - Cache win rate stats for 30s
2. **Batching** - Batch config updates
3. **Optimistic Updates** - Update UI before server response
4. **Error Boundaries** - Graceful error handling

### Bundle Size
1. **Code Splitting** - Lazy load heavy dashboards
2. **Tree Shaking** - Import only used functions
3. **Dynamic Imports** - Load charts on demand

---

## Accessibility

### WCAG 2.1 AA Compliance
1. **Keyboard Navigation** - All interactive elements accessible via keyboard
2. **Screen Reader Support** - Proper ARIA labels and roles
3. **Color Contrast** - Minimum 4.5:1 contrast ratio
4. **Focus Indicators** - Visible focus states
5. **Alt Text** - Descriptive text for icons

### Implementation
```typescript
<button
  aria-label="Configure quiet hours"
  aria-describedby="quiet-hours-help"
  className="focus:ring-2 focus:ring-[#39FF14]"
>
  <Clock size={16} aria-hidden="true" />
</button>
```

---

## Testing Strategy

### Unit Tests
- Test individual components in isolation
- Test utility functions (win rate computation, validation)
- Test state management logic

### Integration Tests
- Test component interactions
- Test hook integrations
- Test data flow

### E2E Tests
- Test complete user flows
- Test mobile responsiveness
- Test accessibility

---

## Implementation Phases

### Phase 1: Foundation (High Priority)
1. Global Win Rate Badge
2. Win Rate Display in Screener
3. Signal Narration Display
4. Quiet Hours Configuration

### Phase 2: Advanced Features (Medium Priority)
5. Enhanced Alert History Panel
6. Alert Priority/Sound Customization
7. Derivatives Intelligence Integration
8. Push Notification Onboarding

### Phase 3: Power User Features (Medium Priority)
9. Conditional Alert Builder
10. Signal Tracker Dashboard
11. Bulk Alert Configuration
12. Mobile Optimizations

### Phase 4: Analytics & Discovery (Lower Priority)
13. Performance Metrics Dashboard
14. Alert Template System
15. Feature Discovery Panel

---

## Correctness Properties

### UI Consistency Properties
1. **Win Rate Accuracy** - Displayed win rates match computed values from signal-tracker.ts
2. **Alert History Completeness** - All alerts from useAlertEngine are displayed
3. **Configuration Persistence** - Settings saved to coinConfig are correctly loaded
4. **Validation Integrity** - Invalid conditional alerts are rejected by validateConditionalConfig

### Performance Properties
1. **Render Efficiency** - No unnecessary re-renders (verified with React DevTools)
2. **Update Latency** - Win rate updates complete within 100ms
3. **Memory Stability** - No memory leaks from intervals or subscriptions

### Accessibility Properties
1. **Keyboard Accessibility** - All features accessible via keyboard
2. **Screen Reader Compatibility** - All content readable by screen readers
3. **Color Contrast** - All text meets WCAG AA standards

---

## Design Complete

This design document provides a comprehensive technical architecture for implementing all 15 requirements. The design prioritizes:
- **Zero new backend logic** - All features use existing functions
- **Performance** - Memoization, lazy loading, efficient rendering
- **Mobile responsiveness** - Touch-friendly, bottom sheets, condensed views
- **Accessibility** - WCAG 2.1 AA compliance
- **Maintainability** - Reusable components, clear separation of concerns

The implementation can proceed in phases, starting with high-priority foundation features and progressing to advanced analytics and discovery features.
