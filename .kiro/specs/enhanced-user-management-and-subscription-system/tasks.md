# Implementation Plan: Enhanced User Management and Subscription System

## Overview

This implementation plan breaks down the enhanced user management and subscription system into discrete, actionable coding tasks. The system extends the existing RSIQ platform with per-user feature flags, dual interface architecture (user-facing and owner-facing), and comprehensive subscription lifecycle management.

**Implementation Language**: TypeScript (Next.js 14+ App Router)

**Key Implementation Areas**:
1. Database schema and data access layer (user_feature_flag table)
2. User feature flags module with caching
3. Enhanced entitlements engine with per-user flag support
4. User account section (new page at /account)
5. Enhanced admin dashboard with per-user feature flag controls
6. API endpoints for user account, admin management, and feature flags
7. Trial period automatic configuration
8. Navigation and routing updates
9. Mobile responsive design
10. Error handling and user feedback

## Tasks

- [ ] 1. Set up database schema and user feature flags module
  - [ ] 1.1 Create user feature flags module (lib/user-feature-flags.ts)
    - Implement `ensureUserFeatureFlagTable()` to create table if not exists
    - Implement `getUserFeatureFlags(userId)` to retrieve all flags for a user
    - Implement `setUserFeatureFlag(userId, flagName, flagValue)` with upsert logic
    - Implement `deleteUserFeatureFlag(userId, flagName)` to remove user overrides
    - Implement `getAllUserFeatureFlags(userId)` for admin display
    - Add cache invalidation helper function
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7_

  - [ ]* 1.2 Write unit tests for user feature flags module
    - Test table creation and idempotency
    - Test flag retrieval with empty results
    - Test flag upsert (insert and update scenarios)
    - Test flag deletion
    - Test JSONB value handling (boolean and numeric)
    - Test unique constraint enforcement
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

- [ ] 2. Implement entitlements caching system
  - [ ] 2.1 Create entitlements cache module (lib/entitlements-cache.ts)
    - Implement `EntitlementsCache` class with in-memory Map storage
    - Implement `get(userId)` with TTL expiration check
    - Implement `set(userId, entitlements)` with 60-second TTL
    - Implement `invalidate(userId)` for cache invalidation
    - Implement `clear()` for full cache reset
    - _Requirements: 14.7, 17.4_

  - [ ]* 2.2 Write unit tests for entitlements cache
    - Test cache hit and miss scenarios
    - Test TTL expiration behavior
    - Test cache invalidation
    - Test cache clear
    - _Requirements: 14.7_

- [ ] 3. Enhance entitlements engine with per-user flag support
  - [ ] 3.1 Extend lib/entitlements.ts with user flag integration
    - Import `getUserFeatureFlags` from user-feature-flags module
    - Import `entitlementsCache` from entitlements-cache module
    - Update `resolveEntitlementsForUser()` to check cache first
    - Add user feature flag retrieval for non-owner users
    - Apply user-specific overrides for `allowAdvancedIndicators`, `allowAlerts`, `allowCustomSettings`
    - Apply user-specific overrides for `maxRecords` and `maxSymbols`
    - Include `userFlags` in returned `ResolvedEntitlements` object
    - Store computed entitlements in cache before returning
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7_

  - [ ]* 3.2 Write integration tests for enhanced entitlements engine
    - Test entitlements for user with no feature flag overrides
    - Test entitlements for user with boolean flag overrides
    - Test entitlements for user with numeric flag overrides (maxRecords, maxSymbols)
    - Test entitlements for owner user (should not apply user flags)
    - Test cache hit scenario
    - Test cache invalidation on flag update
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7_

- [ ] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Create API endpoints for user feature flags (admin)
  - [ ] 5.1 Create GET /api/admin/user-flags/[userId]/route.ts
    - Validate owner authentication using `requireOwner()`
    - Retrieve user-specific flags using `getAllUserFeatureFlags(userId)`
    - Retrieve global flags using `getFeatureFlags()`
    - Compute effective flags (user overrides + global defaults)
    - Return JSON response with userId, flags array, and effectiveFlags
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ] 5.2 Create POST /api/admin/user-flags/route.ts
    - Validate owner authentication using `requireOwner()`
    - Parse request body (userId, flagName, flagValue)
    - Validate flagName is a valid UserFeatureFlagName
    - Call `setUserFeatureFlag(userId, flagName, flagValue)`
    - Return JSON response with updated flag details
    - Handle errors with appropriate HTTP status codes
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ] 5.3 Create DELETE /api/admin/user-flags/[userId]/[flagName]/route.ts
    - Validate owner authentication using `requireOwner()`
    - Call `deleteUserFeatureFlag(userId, flagName)`
    - Return JSON response with success message
    - Handle errors with appropriate HTTP status codes
    - _Requirements: 2.6, 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ]* 5.4 Write integration tests for admin user flag APIs
    - Test GET endpoint with valid userId
    - Test POST endpoint with boolean and numeric values
    - Test DELETE endpoint
    - Test authentication enforcement (non-owner should get 403)
    - Test error handling for invalid userId or flagName
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ] 6. Enhance admin dashboard with per-user feature flag controls
  - [ ] 6.1 Update app/admin/page.tsx with user feature flag UI
    - Add state for tracking user-specific flags (Map<userId, UserFlags>)
    - Add function to load user flags for a specific user
    - Create `FeatureFlagToggle` component for per-user flag controls
    - Add toggle controls for each flag (allowAdvancedIndicators, allowAlerts, allowCustomSettings, maxRecords, maxSymbols)
    - Display effective flag values with visual distinction (global vs user override)
    - Add "Reset to Global" button to remove user overrides
    - Update user list to show indicator when user has custom flags
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [ ] 6.2 Implement analytics dashboard section
    - Add analytics state and API call to /api/admin/analytics
    - Display total users, trial users, subscribed users, suspended users
    - Display MRR (Monthly Recurring Revenue) and ARR (Annual Recurring Revenue)
    - Display growth metrics (new users this month, new subscriptions, churn rate)
    - Style analytics cards with existing dark theme
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7_

  - [ ]* 6.3 Write component tests for admin dashboard enhancements
    - Test feature flag toggle interaction
    - Test reset to global functionality
    - Test analytics display with mock data
    - Test loading states
    - Test error states
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7_

- [ ] 7. Create admin analytics API endpoint
  - [ ] 7.1 Create GET /api/admin/analytics/route.ts
    - Validate owner authentication using `requireOwner()`
    - Query database for total users count
    - Query database for trial users count (users within 14 days of creation with no active subscription)
    - Query database for subscribed users count (active subscriptions)
    - Query database for suspended users count (banned = true)
    - Query database for expired subscriptions count
    - Calculate MRR from active monthly subscriptions
    - Calculate ARR from active yearly subscriptions
    - Calculate growth metrics (new users this month, new subscriptions this month)
    - Return JSON response with users, revenue, and growth objects
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7_

  - [ ]* 7.2 Write integration tests for analytics API
    - Test analytics calculation with mock data
    - Test authentication enforcement
    - Test error handling for database failures
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7_

- [ ] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Create user account section page
  - [ ] 9.1 Create app/account/page.tsx with account layout
    - Create page component with authentication check
    - Implement account header with user name and email
    - Add navigation back to terminal
    - Style with existing dark theme (#05080F background, #39FF14 accents)
    - Implement responsive layout for mobile and desktop
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7_

  - [ ] 9.2 Create subscription status card component
    - Display current subscription status (trial, active, past_due, cancelled, none)
    - Display trial status with days remaining for trial users
    - Display current plan (monthly or yearly) for subscribed users
    - Display subscription renewal date
    - Add upgrade link for trial users
    - Add link to Stripe billing portal for subscribed users
    - Style with status badges (emerald for active, amber for trial, rose for past_due)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [ ] 9.3 Create billing history component
    - Fetch billing history from /api/user/billing-history
    - Display billing history table with date, amount, status, invoice link
    - Handle empty state (no billing history)
    - Handle loading state
    - Handle error state with retry option
    - Sort by date descending (most recent first)
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6, 18.7_

  - [ ]* 9.4 Write component tests for user account section
    - Test subscription status display for different states
    - Test trial countdown display
    - Test billing history rendering
    - Test loading and error states
    - Test responsive layout
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 18.1, 18.2, 18.3, 18.4, 18.5, 18.6_

- [ ] 10. Create user account API endpoints
  - [ ] 10.1 Create GET /api/user/account/route.ts
    - Validate user authentication using `getSessionUser()`
    - Retrieve user details from database
    - Retrieve subscription details using existing subscription query logic
    - Calculate trial days remaining if user is in trial
    - Compute entitlements using `resolveEntitlementsForUser()`
    - Return JSON response with user, subscription, and entitlements
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.8_

  - [ ] 10.2 Create GET /api/user/billing-history/route.ts
    - Validate user authentication using `getSessionUser()`
    - Check if user has Stripe customer ID
    - Retrieve billing history from Stripe API
    - Retrieve manual renewal records from database
    - Combine and sort billing records by date descending
    - Support pagination with limit and offset query params
    - Return JSON response with history array and total count
    - Handle Stripe API errors gracefully
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6, 18.7_

  - [ ]* 10.3 Write integration tests for user account APIs
    - Test GET /api/user/account with authenticated user
    - Test GET /api/user/billing-history with Stripe customer
    - Test GET /api/user/billing-history with no billing history
    - Test authentication enforcement (anonymous should get 401)
    - Test error handling for Stripe API failures
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 18.1, 18.2, 18.3, 18.4, 18.5, 18.6_

- [ ] 11. Implement trial period automatic configuration
  - [ ] 11.1 Update user registration flow to set trial defaults
    - Locate user registration handler (likely in auth callback or registration API)
    - Set `allowTrialAdvancedIndicators` to true for new users (if using user flags)
    - Ensure trial period is calculated as createdAt + 14 days
    - Add welcome message display after registration
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [ ] 11.2 Create trial indicator component
    - Create reusable component to display trial status
    - Show days remaining in trial period
    - Show upgrade prompt when 7 or fewer days remain
    - Style with amber theme for trial status
    - Make component responsive for mobile
    - _Requirements: 8.5, 9.1_

  - [ ]* 11.3 Write tests for trial configuration
    - Test trial period calculation
    - Test trial indicator display with various days remaining
    - Test upgrade prompt display threshold
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 8.5, 9.1_

- [ ] 12. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 13. Update navigation and routing
  - [ ] 13.1 Add account section link to main navigation
    - Update navigation component (likely in app/layout.tsx or shared nav component)
    - Add "Account" link pointing to /account
    - Add conditional "Admin" link for owner users
    - Highlight active navigation item
    - Ensure mobile hamburger menu includes new links
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7_

  - [ ] 13.2 Add breadcrumb navigation to account and admin pages
    - Create breadcrumb component showing current location
    - Add breadcrumbs to /account page (Home > Account)
    - Add breadcrumbs to /admin page (Home > Admin)
    - Style breadcrumbs with existing theme
    - _Requirements: 12.4_

  - [ ]* 13.3 Write tests for navigation updates
    - Test account link visibility for authenticated users
    - Test admin link visibility for owner users only
    - Test active navigation highlighting
    - Test mobile navigation menu
    - _Requirements: 12.1, 12.2, 12.3, 12.6, 12.7_

- [ ] 14. Implement subscription flow enhancements
  - [ ] 14.1 Update subscription page with trial consideration
    - Update app/subscription/page.tsx to check trial status
    - Display trial days remaining if user is in trial
    - Show upgrade prompts for trial users with 7 or fewer days
    - Preserve trial days when subscribing before trial expiration
    - Update checkout flow to handle trial-to-paid transition
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 11.3_

  - [ ] 14.2 Enhance subscription webhook handlers
    - Update Stripe webhook handler (app/api/webhooks/stripe/route.ts or similar)
    - Update NowPayments webhook handler (app/api/webhooks/nowpayments/route.ts)
    - Implement idempotent webhook processing
    - Invalidate entitlements cache on subscription status change
    - Log all webhook events for audit
    - Handle webhook signature validation
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7_

  - [ ] 14.3 Implement subscription renewal and expiration logic
    - Add email notification for renewal reminders (7 days before)
    - Handle renewal payment success (extend periodEnd)
    - Handle renewal payment failure (set status to past_due)
    - Implement grace period logic (7 days for past_due)
    - Revoke access after grace period expiration
    - Send email notifications for payment failures and grace period warnings
    - Handle subscription cancellation (maintain access until periodEnd)
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_

  - [ ]* 14.4 Write integration tests for subscription flow
    - Test trial-to-paid transition
    - Test webhook idempotency
    - Test grace period access maintenance
    - Test access revocation after grace period
    - Test subscription cancellation behavior
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 17.1, 17.2, 17.3, 17.4_

- [ ] 15. Implement subscription edge case handling
  - [ ] 15.1 Handle multiple subscription records
    - Update subscription query logic to prioritize by status (active > trialing > past_due)
    - Ensure only the highest priority subscription is used for entitlements
    - _Requirements: 11.1_

  - [ ] 15.2 Handle expired active subscriptions
    - Add check for periodEnd in the past with status "active"
    - Treat as expired and revoke access
    - _Requirements: 11.2_

  - [ ] 15.3 Handle trial preservation on early subscription
    - When trial user subscribes before trial expiration, preserve remaining trial days
    - Delay first billing until trial expiration
    - _Requirements: 11.3_

  - [ ] 15.4 Handle subscription downgrades
    - Implement downgrade logic (yearly to monthly)
    - Apply change at next billing cycle, not immediately
    - _Requirements: 11.4_

  - [ ]* 15.5 Write tests for edge case handling
    - Test multiple subscription priority logic
    - Test expired active subscription handling
    - Test trial preservation on early subscription
    - Test subscription downgrade timing
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

- [ ] 16. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 17. Implement error handling and user feedback
  - [ ] 17.1 Add error handling to all API endpoints
    - Wrap API logic in try-catch blocks
    - Distinguish between user errors (400) and system errors (500)
    - Return consistent error response format { error: string, code?: string }
    - Log all errors to console with sufficient context
    - _Requirements: 20.1, 20.2, 20.7_

  - [ ] 17.2 Add user feedback components
    - Create toast notification component for success/error messages
    - Style error messages with rose theme
    - Style success messages with emerald theme
    - Add actionable guidance in error messages
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 20.6_

  - [ ] 17.3 Add loading states to all interactive components
    - Add loading spinners to buttons during async operations
    - Add skeleton loaders for data fetching
    - Disable interactive elements during loading
    - _Requirements: 20.5_

  - [ ] 17.4 Add payment error handling
    - Display specific payment errors from Stripe/NowPayments
    - Provide actionable guidance (e.g., "Check card details and try again")
    - Add retry functionality for failed payments
    - _Requirements: 20.3, 20.4_

  - [ ]* 17.5 Write tests for error handling
    - Test API error responses
    - Test toast notification display
    - Test loading state behavior
    - Test payment error display
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 20.6, 20.7_

- [ ] 18. Implement mobile responsive design
  - [ ] 18.1 Make user account section mobile responsive
    - Test layout on screen widths 320px to 2560px
    - Use Tailwind responsive breakpoints (sm, md, lg, xl)
    - Ensure touch targets are minimum 44px on mobile
    - Optimize font sizes for small screens
    - Test on iOS Safari and Android Chrome
    - _Requirements: 19.1, 19.3, 19.4, 19.5, 19.7_

  - [ ] 18.2 Make admin dashboard mobile responsive (tablet and up)
    - Test layout on screen widths 768px to 2560px
    - Use responsive grid layouts for user list and forms
    - Ensure touch-friendly controls on tablets
    - Optimize table displays for smaller screens
    - _Requirements: 19.2, 19.3, 19.4, 19.5, 19.7_

  - [ ] 18.3 Update navigation for mobile
    - Implement hamburger menu for screens < 768px
    - Ensure all navigation links are accessible on mobile
    - Test touch interactions on mobile devices
    - _Requirements: 19.6, 19.7_

  - [ ]* 18.4 Write responsive design tests
    - Test layout at various breakpoints
    - Test touch target sizes
    - Test mobile navigation menu
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5, 19.6, 19.7_

- [ ] 19. Implement dual interface separation
  - [ ] 19.1 Ensure user account section shows only user-relevant data
    - Remove any administrative controls from /account
    - Display only personal subscription status and billing
    - Hide user management and feature flag controls
    - _Requirements: 13.1, 13.3_

  - [ ] 19.2 Ensure admin dashboard shows only owner-relevant data
    - Remove personal subscription management from /admin
    - Display only administrative functions (user management, feature flags, analytics)
    - _Requirements: 13.2, 13.4_

  - [ ] 19.3 Add visual distinction between interfaces
    - Use distinct headers for user account vs admin dashboard
    - Add "Owner Only" badge to admin dashboard
    - Use consistent but distinct visual themes
    - _Requirements: 13.5_

  - [ ] 19.4 Handle owner accessing user account section
    - When owner accesses /account, show owner's personal subscription info
    - Do not show administrative data in user account section
    - _Requirements: 13.6_

  - [ ] 19.5 Add clear interface labels
    - Add labels indicating "User Account" vs "Admin Dashboard"
    - Provide clear navigation between interfaces
    - _Requirements: 13.7_

  - [ ]* 19.6 Write tests for interface separation
    - Test user account section content for regular users
    - Test admin dashboard content for owner
    - Test owner accessing user account section
    - Test visual distinction between interfaces
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7_

- [ ] 20. Final integration and wiring
  - [ ] 20.1 Wire all components together
    - Verify all API endpoints are connected to UI components
    - Verify all database queries are optimized with proper indexes
    - Verify all authentication checks are in place
    - Verify all cache invalidation is working correctly
    - _Requirements: All_

  - [ ] 20.2 Add comprehensive logging
    - Add structured logging to all critical operations
    - Log feature flag changes with userId and timestamp
    - Log subscription status changes
    - Log authentication failures
    - _Requirements: 17.5, 20.7_

  - [ ] 20.3 Verify backward compatibility
    - Test existing features still work with new entitlements engine
    - Test existing global feature flags still work
    - Test existing subscription flows are not broken
    - _Requirements: All_

  - [ ]* 20.4 Write end-to-end integration tests
    - Test complete user journey: registration → trial → subscription → renewal
    - Test complete owner journey: login → user management → feature flag control
    - Test edge cases: suspended user, expired trial, failed payment
    - _Requirements: All_

- [ ] 21. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP delivery
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation throughout implementation
- All code should follow existing TypeScript and Next.js patterns in the codebase
- Use existing authentication patterns (`authClient.useSession()`, `requireOwner()`)
- Follow existing styling patterns (dark theme with #05080F background, #39FF14 accents)
- Maintain backward compatibility with existing feature flag and entitlements systems
- All database operations should use Prisma ORM or raw SQL with proper error handling
- All API endpoints should validate authentication and authorization
- All UI components should be mobile responsive and accessible
