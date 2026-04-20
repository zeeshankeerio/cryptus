# Requirements Document: RSI Screener UI/UX Improvements

## Introduction

This document specifies requirements for enhancing the RSI Screener user interface to expose advanced features that are already implemented in the backend but not fully visible or accessible in the UI. The goal is to improve discoverability, usability, and user satisfaction by making powerful features like win rate tracking, conditional alerts, derivatives intelligence, and per-symbol customization prominently available to users.

The backend already contains sophisticated logic for signal tracking, alert prioritization, quiet hours, conditional alert evaluation, and derivatives data integration. This specification focuses purely on UI/UX improvements to surface these capabilities without requiring new backend computation.

## Glossary

- **Win_Rate_Tracker**: System that tracks signal outcomes at 5m, 15m, and 1h intervals to compute accuracy metrics
- **Conditional_Alert**: Alert that triggers when multiple conditions (up to 5) are met using AND/OR logic
- **Signal_Tracker_Dashboard**: Dedicated UI panel showing win rate analytics and signal performance
- **Quiet_Hours**: Per-symbol time window during which low/medium priority alerts are suppressed
- **Alert_Priority**: Classification system (low/medium/high/critical) that determines alert behavior
- **Derivatives_Intelligence**: Real-time data including funding rates, liquidations, whale alerts, and order flow
- **Signal_Narration_Engine**: Backend system that generates rich explanations for trading signals
- **Push_Notification_Service**: Service worker integration for background alerts when app is closed
- **Alert_History_Panel**: UI component displaying past alerts with context and outcomes
- **Per_Symbol_Customization**: Ability to configure priority, sound, quiet hours, and thresholds per trading pair
- **Global_Win_Rate_Badge**: Prominent UI element showing overall system signal accuracy
- **Sound_Customization**: Per-symbol alert sound selection from available sound profiles
- **UI_Component**: Visual element in the user interface
- **Backend_Logic**: Server-side or client-side computation already implemented
- **Onboarding_Flow**: Step-by-step guided process for new feature setup

## Requirements

### Requirement 1: Win Rate Display System

**User Story:** As a trader, I want to see win rate statistics for signals, so that I can assess the accuracy and reliability of the screener's recommendations.

#### Acceptance Criteria

1. WHEN a signal is displayed in the screener, THE UI_Component SHALL display the win rate percentage for that symbol at 5m, 15m, and 1h intervals
2. WHEN the user hovers over a win rate metric, THE UI_Component SHALL display a tooltip showing wins, losses, and average return
3. THE Global_Win_Rate_Badge SHALL display the overall system win rate in the header or navigation bar
4. WHEN win rate data is unavailable for a symbol, THE UI_Component SHALL display a "Tracking..." indicator instead of a percentage
5. THE Win_Rate_Tracker SHALL update win rate displays every 30 seconds without requiring page refresh

### Requirement 2: Conditional Alert Creation Interface

**User Story:** As a power user, I want to create conditional alerts through the UI, so that I can set up complex multi-condition triggers without writing code.

#### Acceptance Criteria

1. WHEN the user opens symbol settings, THE UI_Component SHALL provide a "Conditional Alerts" section with an "Add Condition" button
2. THE UI_Component SHALL allow the user to add up to 5 conditions per alert
3. WHEN adding a condition, THE UI_Component SHALL provide dropdowns for condition type (rsi, volume_spike, ema_cross, macd_signal, bb_touch, price_change), operator (<, >, =, cross_above, cross_below), and value input
4. THE UI_Component SHALL provide a toggle to select AND or OR logic for combining conditions
5. WHEN the user saves a conditional alert, THE Backend_Logic SHALL validate the configuration using the existing validateConditionalConfig function
6. IF validation fails, THEN THE UI_Component SHALL display specific error messages for each invalid condition
7. THE UI_Component SHALL display all active conditional alerts for a symbol with the ability to edit or delete them

### Requirement 3: Push Notification Onboarding Flow

**User Story:** As a mobile user, I want a clear onboarding process for push notifications, so that I can easily enable 24/7 background alerts.

#### Acceptance Criteria

1. WHEN a user first visits the screener, THE Onboarding_Flow SHALL display a modal or banner explaining push notification benefits
2. THE Onboarding_Flow SHALL include a step-by-step wizard with: (1) Permission request explanation, (2) Browser permission prompt, (3) Success confirmation with test notification option
3. WHEN the user completes onboarding, THE Push_Notification_Service SHALL send a test notification to confirm setup
4. THE UI_Component SHALL display push notification status (active/inactive/denied/unsupported) in the settings panel
5. WHEN push notifications are denied, THE UI_Component SHALL provide instructions for re-enabling in browser settings
6. THE UI_Component SHALL include a "Send Test Notification" button in settings to verify push notification functionality

### Requirement 4: Quiet Hours Configuration UI

**User Story:** As a trader, I want to configure quiet hours per symbol, so that I can avoid alert fatigue during specific time periods without disabling alerts entirely.

#### Acceptance Criteria

1. WHEN the user opens symbol settings, THE UI_Component SHALL provide a "Quiet Hours" section with an enable/disable toggle
2. WHEN quiet hours are enabled, THE UI_Component SHALL provide time pickers for start hour (0-23) and end hour (0-23)
3. THE UI_Component SHALL display a visual timeline showing when quiet hours are active (e.g., shaded region on 24-hour clock)
4. THE UI_Component SHALL explain that high and critical priority alerts bypass quiet hours
5. WHEN the user saves quiet hours settings, THE Backend_Logic SHALL use the existing shouldSuppressAlert function to enforce suppression
6. THE UI_Component SHALL display a "Quiet" badge on symbols that currently have active quiet hours

### Requirement 5: Enhanced Alert History Panel

**User Story:** As a trader, I want to see detailed context for past alerts, so that I can review what triggered each alert and whether it was accurate.

#### Acceptance Criteria

1. WHEN the user opens the alert history panel, THE UI_Component SHALL display alerts in reverse chronological order with symbol, timeframe, type, value, price, and timestamp
2. THE UI_Component SHALL display win/loss outcome for each alert if the signal has been evaluated (5m, 15m, 1h)
3. WHEN an alert was triggered by a conditional alert, THE UI_Component SHALL display which conditions were met
4. THE UI_Component SHALL provide filters for alert type (OVERSOLD, OVERBOUGHT, STRATEGY_STRONG_BUY, STRATEGY_STRONG_SELL, LONG_CANDLE, VOLUME_SPIKE)
5. THE UI_Component SHALL provide a date range filter for viewing historical alerts
6. WHEN the user clicks on an alert, THE UI_Component SHALL display the full signal narration if available
7. THE UI_Component SHALL display alert priority (low/medium/high/critical) with color coding

### Requirement 6: Signal Tracker Dashboard

**User Story:** As a trader, I want a dedicated dashboard for win rate analytics, so that I can analyze signal performance across all symbols and timeframes.

#### Acceptance Criteria

1. THE Signal_Tracker_Dashboard SHALL display a table of all tracked symbols with columns for: symbol, total signals, win rate 5m, win rate 15m, win rate 1h, average return 5m, average return 15m, average return 1h
2. THE Signal_Tracker_Dashboard SHALL provide sorting by any column (ascending/descending)
3. THE Signal_Tracker_Dashboard SHALL display a summary card showing global statistics: total signals tracked, overall win rate, best performing symbol, worst performing symbol
4. THE Signal_Tracker_Dashboard SHALL provide a filter to show only symbols with minimum signal count (e.g., "Show symbols with 10+ signals")
5. WHEN the user clicks on a symbol row, THE Signal_Tracker_Dashboard SHALL display a detailed breakdown of individual signals with entry price, outcome prices, and win/loss status
6. THE Signal_Tracker_Dashboard SHALL provide a "Clear All Data" button with confirmation dialog to reset signal tracking
7. THE Signal_Tracker_Dashboard SHALL update statistics every 30 seconds using the existing computeWinRateStats function

### Requirement 7: Derivatives Intelligence Integration

**User Story:** As a crypto trader, I want to see derivatives data (funding rates, liquidations, order flow) in the main screener view, so that I can make informed decisions without switching panels.

#### Acceptance Criteria

1. WHEN derivatives data is available for a symbol, THE UI_Component SHALL display funding rate in the screener row with color coding (positive = green, negative = red)
2. THE UI_Component SHALL display order flow pressure indicator (bullish/bearish/neutral) based on buy/sell volume ratio
3. WHEN a large liquidation event occurs, THE UI_Component SHALL display a liquidation badge with size and direction (long/short)
4. THE UI_Component SHALL provide a toggle in column settings to show/hide derivatives columns
5. WHEN the user hovers over a derivatives metric, THE UI_Component SHALL display a tooltip with detailed breakdown (e.g., funding rate annualized, buy volume, sell volume)
6. THE Derivatives_Intelligence SHALL use the existing useDerivativesIntel hook to fetch real-time data
7. WHEN derivatives data is unavailable for a symbol, THE UI_Component SHALL display "-" instead of attempting to show stale data

### Requirement 8: Alert Priority and Sound Customization UI

**User Story:** As a trader, I want to customize alert priority and sounds per symbol, so that I can prioritize important pairs and use different audio cues for different assets.

#### Acceptance Criteria

1. WHEN the user opens symbol settings, THE UI_Component SHALL provide a "Priority" dropdown with options: low, medium, high, critical
2. THE UI_Component SHALL explain the behavior for each priority level (sound type, persistence, vibration pattern, toast duration)
3. WHEN the user opens symbol settings, THE UI_Component SHALL provide a "Sound" dropdown with options: default, soft, urgent, bell, ping
4. THE UI_Component SHALL provide a "Preview Sound" button that plays the selected alert sound
5. WHEN the user saves priority or sound settings, THE Backend_Logic SHALL use the existing getAlertBehavior function to apply the configuration
6. THE UI_Component SHALL display a priority badge (color-coded) on symbols in the screener that have non-default priority
7. THE UI_Component SHALL provide a bulk action to apply priority/sound settings to multiple symbols at once

### Requirement 9: Global Win Rate Badge

**User Story:** As a trader, I want to see the overall system win rate prominently displayed, so that I can quickly assess the screener's current performance.

#### Acceptance Criteria

1. THE Global_Win_Rate_Badge SHALL display in the header or navigation bar with format "Win Rate: XX%" where XX is the 15m win rate
2. WHEN the user hovers over the badge, THE UI_Component SHALL display a tooltip showing win rates for all timeframes (5m, 15m, 1h) and total signals tracked
3. THE Global_Win_Rate_Badge SHALL update every 30 seconds using the existing getGlobalWinRate function
4. WHEN win rate is above 60%, THE Global_Win_Rate_Badge SHALL display in green with a positive indicator
5. WHEN win rate is below 40%, THE Global_Win_Rate_Badge SHALL display in red with a warning indicator
6. WHEN win rate is between 40-60%, THE Global_Win_Rate_Badge SHALL display in yellow/neutral color
7. WHEN insufficient data is available (less than 10 signals), THE Global_Win_Rate_Badge SHALL display "Calibrating..." instead of a percentage

### Requirement 10: Advanced Feature Discoverability

**User Story:** As a new user, I want to discover advanced features easily, so that I can take full advantage of the screener's capabilities without reading documentation.

#### Acceptance Criteria

1. THE UI_Component SHALL provide a "Features" or "What's New" panel accessible from the main navigation
2. THE UI_Component SHALL display feature cards for: Win Rate Tracking, Conditional Alerts, Push Notifications, Quiet Hours, Derivatives Intelligence, Signal Tracker Dashboard
3. WHEN the user clicks on a feature card, THE UI_Component SHALL display a modal with explanation, benefits, and a "Try It Now" button that navigates to the relevant settings
4. THE UI_Component SHALL display a badge count on the "Features" menu item showing number of unused advanced features
5. WHEN the user enables a feature for the first time, THE UI_Component SHALL mark it as "used" and decrement the badge count
6. THE UI_Component SHALL provide tooltips with info icons next to advanced settings explaining their purpose
7. THE UI_Component SHALL include contextual help links in settings panels that open relevant documentation or video tutorials

### Requirement 11: Mobile-Optimized Alert Controls

**User Story:** As a mobile trader, I want touch-friendly alert controls, so that I can manage alerts efficiently on my phone without frustration.

#### Acceptance Criteria

1. WHEN the user accesses the screener on a mobile device (screen width < 768px), THE UI_Component SHALL display a bottom sheet or drawer for symbol settings instead of a modal
2. THE UI_Component SHALL provide large touch targets (minimum 44x44px) for all interactive elements in mobile view
3. THE UI_Component SHALL use native mobile UI patterns (swipe to delete, pull to refresh) where appropriate
4. WHEN the user long-presses a symbol row on mobile, THE UI_Component SHALL display a context menu with quick actions: Add to Watchlist, Configure Alerts, View History
5. THE UI_Component SHALL provide a floating action button (FAB) on mobile for quick access to global settings
6. THE UI_Component SHALL optimize form inputs for mobile (number keyboards for numeric inputs, time pickers for hours)
7. THE UI_Component SHALL display condensed metrics on mobile with expandable sections for detailed data

### Requirement 12: Signal Narration Display

**User Story:** As a trader, I want to see rich explanations for signals, so that I understand why the screener generated a specific alert.

#### Acceptance Criteria

1. WHEN a signal is displayed in the screener, THE UI_Component SHALL provide an info icon or "Why?" button next to the signal badge
2. WHEN the user clicks the info icon, THE UI_Component SHALL display the signal narration generated by the existing generateSignalNarration function
3. THE UI_Component SHALL display narration with: headline, conviction percentage, conviction label, emoji, and list of technical reasons
4. THE UI_Component SHALL provide a "Copy Signal Brief" button that copies the narration to clipboard in shareable format
5. WHEN the user copies a signal brief, THE UI_Component SHALL include a link to the symbol detail page for viral sharing
6. THE UI_Component SHALL display narration in a modal or popover with clear typography and visual hierarchy
7. WHEN narration is unavailable (neutral signals), THE UI_Component SHALL display "No active signal" instead of showing empty content

### Requirement 13: Bulk Alert Configuration

**User Story:** As a trader managing many symbols, I want to apply alert settings to multiple symbols at once, so that I can configure my screener efficiently without repetitive actions.

#### Acceptance Criteria

1. THE UI_Component SHALL provide a "Bulk Actions" button in the screener toolbar
2. WHEN the user clicks "Bulk Actions", THE UI_Component SHALL enable checkbox selection mode for symbol rows
3. THE UI_Component SHALL display a floating action bar showing number of selected symbols and available actions
4. THE UI_Component SHALL provide bulk actions for: Set Priority, Set Sound, Enable Quiet Hours, Apply Alert Template
5. WHEN the user applies a bulk action, THE UI_Component SHALL display a confirmation dialog showing which symbols will be affected
6. THE Backend_Logic SHALL use the existing updateCoinConfig function to apply settings to all selected symbols
7. WHEN bulk action completes, THE UI_Component SHALL display a success toast with count of symbols updated

### Requirement 14: Alert Template System UI

**User Story:** As a trader, I want to save and reuse alert configurations as templates, so that I can quickly apply proven settings to new symbols.

#### Acceptance Criteria

1. THE UI_Component SHALL provide a "Templates" section in settings with "Create Template" button
2. WHEN creating a template, THE UI_Component SHALL allow the user to name the template, add description, and configure all alert settings (RSI periods, thresholds, priority, sound, quiet hours)
3. THE UI_Component SHALL display a list of saved templates with name, description, and creation date
4. WHEN the user clicks on a template, THE UI_Component SHALL provide options to: Edit, Delete, Apply to Symbol, Apply to Multiple Symbols
5. THE Backend_Logic SHALL use the existing AlertTemplate model to persist templates
6. WHEN applying a template to a symbol, THE UI_Component SHALL display a preview of changes before confirming
7. THE UI_Component SHALL provide default templates (Conservative, Aggressive, Day Trading, Swing Trading) that users can customize

### Requirement 15: Performance Metrics Dashboard

**User Story:** As a trader, I want to see performance metrics for my alert configuration, so that I can optimize my settings based on historical data.

#### Acceptance Criteria

1. THE UI_Component SHALL provide a "Performance" tab in the Signal Tracker Dashboard
2. THE UI_Component SHALL display metrics for: total alerts fired, alert frequency per symbol, most profitable timeframe, best performing priority level
3. THE UI_Component SHALL display a chart showing win rate trend over time (daily, weekly, monthly views)
4. THE UI_Component SHALL display a heatmap showing which hour of day has highest win rate
5. THE UI_Component SHALL provide filters to analyze performance by: symbol, timeframe, alert type, priority level
6. THE UI_Component SHALL display recommendations based on performance data (e.g., "15m signals have 68% win rate - consider focusing on this timeframe")
7. THE UI_Component SHALL allow exporting performance data as CSV for external analysis

## Special Requirements Guidance

### Parser and Serializer Requirements

This feature does not require parsers or serializers as it focuses on UI/UX improvements for existing backend functionality. All data structures are already defined and handled by existing backend logic.

### Round-Trip Properties

Not applicable - this feature does not involve data transformation or serialization that would benefit from round-trip testing.

## Iteration and Feedback Rules

- All requirements are subject to user feedback and may be refined based on usability testing
- UI mockups and prototypes should be reviewed with stakeholders before implementation
- Accessibility compliance (WCAG 2.1 AA) must be verified for all new UI components
- Mobile responsiveness must be tested on devices with screen widths from 320px to 768px
- Performance impact of UI updates must be measured to ensure no degradation in screener responsiveness

## Phase Completion

This requirements document is now complete and ready for review. All acceptance criteria follow EARS patterns and INCOSE quality rules. The requirements focus on exposing existing backend features through improved UI/UX without requiring new backend computation.
