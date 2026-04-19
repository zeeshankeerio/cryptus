# Requirements Document

## Introduction

This document specifies requirements for an enhanced user management and subscription system that provides granular per-user feature control, dual interface architecture (user-facing and owner-facing), and a seamless subscription lifecycle. The system extends the existing entitlements and feature flag infrastructure to support per-user overrides, automatic trial period configuration, and comprehensive owner administrative capabilities.

## Glossary

- **System**: The enhanced user management and subscription system
- **Owner**: The super administrator with email zeeshan.keerio@mindscapeanalytics.com or role "owner"
- **User**: Any authenticated user of the platform
- **Trial_User**: A user within their 14-day trial period
- **Subscribed_User**: A user with an active paid subscription
- **Feature_Flag**: A boolean or numeric configuration that controls access to specific features
- **Global_Feature_Flag**: A feature flag that applies to all users by default
- **User_Feature_Flag**: A per-user feature flag override that takes precedence over global flags
- **Owner_Dashboard**: The administrative interface accessible only to the Owner
- **User_Account_Section**: The user-facing interface for subscription and account management
- **Entitlement**: The computed set of permissions and limits for a specific user
- **Advanced_Indicators**: Premium analytical features requiring subscription or trial access
- **Subscription_Flow**: The complete user journey from trial through payment to active subscription
- **Grace_Period**: The time window after payment failure during which access is maintained
- **Manual_Renewal**: Owner-initiated subscription extension for off-platform payments

## Requirements

### Requirement 1: Trial Period Automatic Configuration

**User Story:** As a new user, I want to automatically receive access to advanced indicators during my trial period, so that I can evaluate the full platform capabilities before subscribing.

#### Acceptance Criteria

1. WHEN a new user account is created, THE System SHALL set the trial period to 14 days
2. WHEN a Trial_User account is created, THE System SHALL set allowTrialAdvancedIndicators to true by default
3. WHILE a user is within their trial period, THE System SHALL grant access to Advanced_Indicators without restrictions
4. WHEN the trial period expires, THE System SHALL revoke Advanced_Indicators access unless the user has an active subscription
5. THE System SHALL calculate trial expiration as user creation timestamp plus 14 days

### Requirement 2: Per-User Feature Flag System

**User Story:** As the Owner, I want to control feature flags for individual users, so that I can provide custom access levels and handle special cases without changing global settings.

#### Acceptance Criteria

1. THE System SHALL support per-user feature flag overrides for all feature flags
2. WHEN a User_Feature_Flag exists for a user, THE System SHALL apply the user-specific value instead of the Global_Feature_Flag value
3. THE System SHALL support the following per-user feature flags: allowAdvancedIndicators, allowAlerts, allowCustomSettings, maxRecords, maxSymbols
4. WHEN computing entitlements, THE System SHALL check for User_Feature_Flag first, then fall back to Global_Feature_Flag
5. THE System SHALL persist User_Feature_Flag values in the database with userId, flagName, flagValue, and updatedAt fields
6. WHEN a User_Feature_Flag is deleted, THE System SHALL revert to the Global_Feature_Flag value for that user

### Requirement 3: Owner Dashboard Feature Flag Management

**User Story:** As the Owner, I want a comprehensive admin panel to manage all feature flags for individual users, so that I have complete control over user access without technical barriers.

#### Acceptance Criteria

1. THE Owner_Dashboard SHALL display a list of all registered users with their current feature flag states
2. THE Owner_Dashboard SHALL provide toggle controls for each feature flag per user
3. WHEN the Owner toggles a feature flag for a user, THE System SHALL create or update the User_Feature_Flag immediately
4. THE Owner_Dashboard SHALL display both global and per-user feature flag values with clear visual distinction
5. THE Owner_Dashboard SHALL allow the Owner to reset a user's feature flags to global defaults
6. THE Owner_Dashboard SHALL display the effective feature flag value (user override or global default) for each user
7. THE Owner_Dashboard SHALL provide search and filter capabilities to locate specific users

### Requirement 4: Owner Dashboard Access Control

**User Story:** As the Owner, I want exclusive access to the Owner Dashboard, so that sensitive administrative functions are protected from unauthorized access.

#### Acceptance Criteria

1. WHEN a user attempts to access the Owner_Dashboard, THE System SHALL verify the user email matches AUTH_CONFIG.SUPER_ADMIN_EMAIL or role equals "owner"
2. IF a non-owner user attempts to access the Owner_Dashboard, THEN THE System SHALL display an access denied message and prevent access
3. THE System SHALL restrict all Owner_Dashboard API endpoints to Owner authentication
4. WHEN an API request to an owner endpoint is received, THE System SHALL validate owner credentials before processing
5. IF an unauthorized API request is received, THEN THE System SHALL return HTTP 403 status with an error message

### Requirement 5: Owner Dashboard User Management

**User Story:** As the Owner, I want to view, suspend, and reactivate user accounts, so that I can manage platform access and handle policy violations.

#### Acceptance Criteria

1. THE Owner_Dashboard SHALL display all users with their name, email, role, subscription status, and account status
2. THE Owner_Dashboard SHALL provide a suspend action for each active user
3. WHEN the Owner suspends a user, THE System SHALL set the user banned field to true and record a suspension reason
4. THE Owner_Dashboard SHALL provide a reactivate action for each suspended user
5. WHEN the Owner reactivates a user, THE System SHALL set the user banned field to false and clear the suspension reason
6. WHEN a suspended user attempts to access the platform, THE System SHALL deny access and display a suspension message
7. THE Owner_Dashboard SHALL display the suspension reason for suspended users

### Requirement 6: Manual Renewal Functionality

**User Story:** As the Owner, I want to manually renew subscriptions for users who pay through off-platform channels, so that I can maintain accurate subscription records for all payment methods.

#### Acceptance Criteria

1. THE Owner_Dashboard SHALL provide a manual renewal form with fields for userId, plan (monthly or yearly), invoiceRef, periodEnd date, and optional notes
2. WHEN the Owner submits a manual renewal, THE System SHALL create or update a subscription record with status "active"
3. THE System SHALL set the subscription periodEnd to the Owner-specified date
4. THE System SHALL store the invoiceRef and renewal notes in the subscription record
5. WHEN a manual renewal is applied, THE System SHALL immediately update the user entitlements to reflect the active subscription
6. THE System SHALL validate that periodEnd is a future date before applying manual renewal
7. IF manual renewal validation fails, THEN THE System SHALL display an error message and prevent the renewal

### Requirement 7: User Account Section Interface

**User Story:** As a user, I want a dedicated account section to view my subscription status and manage my account, so that I can understand my current plan and make changes independently.

#### Acceptance Criteria

1. THE User_Account_Section SHALL display the user current subscription status (trial, active, past_due, cancelled, or none)
2. THE User_Account_Section SHALL display trial status with days remaining when the user is a Trial_User
3. THE User_Account_Section SHALL display the current subscription plan (monthly or yearly) when the user is a Subscribed_User
4. THE User_Account_Section SHALL display the subscription renewal date when applicable
5. THE User_Account_Section SHALL provide a link to upgrade from trial to paid subscription
6. THE User_Account_Section SHALL provide a link to the Stripe billing portal for Subscribed_User accounts
7. THE User_Account_Section SHALL display billing history when available
8. THE User_Account_Section SHALL be accessible to all authenticated users

### Requirement 8: Subscription Flow Onboarding

**User Story:** As a new user, I want a seamless onboarding experience with automatic trial activation, so that I can start using the platform immediately without friction.

#### Acceptance Criteria

1. WHEN a new user completes registration, THE System SHALL automatically activate a 14-day trial period
2. THE System SHALL set allowTrialAdvancedIndicators to true for new Trial_User accounts
3. THE System SHALL display a welcome message explaining trial benefits and duration
4. THE System SHALL provide clear navigation to the terminal and key features after registration
5. WHEN a Trial_User first accesses the platform, THE System SHALL display a trial indicator showing days remaining
6. THE System SHALL send a welcome email with trial details and upgrade information

### Requirement 9: Subscription Flow Upgrade Path

**User Story:** As a Trial_User, I want clear upgrade options and a smooth payment process, so that I can transition to a paid subscription without confusion.

#### Acceptance Criteria

1. THE User_Account_Section SHALL display upgrade prompts when a Trial_User has 7 or fewer days remaining
2. THE System SHALL provide both monthly and yearly subscription options with clear pricing
3. WHEN a Trial_User selects a subscription plan, THE System SHALL initiate Stripe checkout with trial period consideration
4. THE System SHALL support both Stripe and NowPayments (crypto) payment methods
5. WHEN payment is successful, THE System SHALL immediately update the user subscription status to "active"
6. WHEN payment is successful, THE System SHALL update entitlements to reflect Subscribed_User access
7. THE System SHALL redirect the user to a success page after successful subscription activation

### Requirement 10: Subscription Flow Renewal and Expiration

**User Story:** As a Subscribed_User, I want automatic renewal handling and clear notifications, so that my access continues uninterrupted and I am informed of any payment issues.

#### Acceptance Criteria

1. WHEN a subscription renewal date approaches, THE System SHALL send a reminder email 7 days before renewal
2. WHEN a subscription renewal payment succeeds, THE System SHALL extend the periodEnd date by the subscription period
3. WHEN a subscription renewal payment fails, THE System SHALL set the subscription status to "past_due"
4. WHILE a subscription is in "past_due" status, THE System SHALL maintain access for the Grace_Period duration (7 days)
5. WHEN the Grace_Period expires without successful payment, THE System SHALL revoke Subscribed_User access
6. THE System SHALL send email notifications for payment failures and grace period warnings
7. WHEN a user cancels their subscription, THE System SHALL maintain access until the current periodEnd date

### Requirement 11: Subscription Flow Edge Case Handling

**User Story:** As a user, I want the system to handle all subscription edge cases gracefully, so that I never encounter broken states or unclear access status.

#### Acceptance Criteria

1. WHEN a user has multiple subscription records, THE System SHALL use the subscription with the highest priority status (active > trialing > past_due)
2. IF a subscription periodEnd is in the past and status is "active", THEN THE System SHALL treat the subscription as expired
3. WHEN a Trial_User subscribes before trial expiration, THE System SHALL preserve remaining trial days and delay billing
4. WHEN a Subscribed_User downgrades from yearly to monthly, THE System SHALL apply the change at the next billing cycle
5. WHEN a subscription webhook is received, THE System SHALL update the subscription record atomically to prevent race conditions
6. IF a subscription update fails due to database error, THEN THE System SHALL log the error and retry the update
7. THE System SHALL handle duplicate webhook events idempotently to prevent double-processing

### Requirement 12: Navigation and Routing Architecture

**User Story:** As a user or Owner, I want clear and intuitive navigation between all sections, so that I can access the features I need without confusion.

#### Acceptance Criteria

1. THE System SHALL provide a navigation menu with links to User_Account_Section, terminal, and other key features
2. WHEN the Owner is authenticated, THE System SHALL display an additional navigation link to the Owner_Dashboard
3. THE System SHALL use distinct routes for User_Account_Section (/account) and Owner_Dashboard (/admin)
4. THE System SHALL provide breadcrumb navigation showing the current location within the application
5. THE System SHALL provide back navigation from User_Account_Section and Owner_Dashboard to the terminal
6. THE System SHALL highlight the active navigation item in the menu
7. THE System SHALL be responsive and provide mobile-optimized navigation on small screens

### Requirement 13: Dual Interface Separation

**User Story:** As a user and Owner, I want clear separation between user-facing and owner-facing interfaces, so that administrative functions do not clutter the user experience and user functions do not clutter the admin panel.

#### Acceptance Criteria

1. THE User_Account_Section SHALL display only user-relevant information (subscription status, billing, account settings)
2. THE Owner_Dashboard SHALL display only owner-relevant information (all users, feature flags, manual renewals, user management)
3. THE System SHALL not display owner-specific controls or data in the User_Account_Section
4. THE System SHALL not display user-specific subscription management in the Owner_Dashboard
5. THE System SHALL use distinct visual themes or headers to differentiate User_Account_Section from Owner_Dashboard
6. WHEN the Owner accesses the User_Account_Section, THE System SHALL display the Owner personal subscription information, not administrative data
7. THE System SHALL provide clear labels indicating whether the user is in the user interface or owner interface

### Requirement 14: Entitlements Computation with Per-User Flags

**User Story:** As a user, I want my access permissions to be computed accurately based on my subscription status and any custom feature flags, so that I receive the correct level of access.

#### Acceptance Criteria

1. WHEN computing entitlements for a user, THE System SHALL first check for User_Feature_Flag overrides
2. IF a User_Feature_Flag exists for a specific feature, THEN THE System SHALL use the user-specific value
3. IF no User_Feature_Flag exists for a specific feature, THEN THE System SHALL use the Global_Feature_Flag value
4. THE System SHALL compute maxRecords based on subscription status, trial status, and any User_Feature_Flag override
5. THE System SHALL compute feature access (alerts, advanced indicators, custom settings) based on subscription status, trial status, and User_Feature_Flag overrides
6. THE System SHALL return entitlements as a structured object containing tier, features, maxRecords, maxSymbols, and flags
7. THE System SHALL cache entitlements computation results for 60 seconds to optimize performance

### Requirement 15: Feature Flag Persistence and Retrieval

**User Story:** As the system, I want to persist and retrieve feature flags efficiently, so that feature flag changes take effect immediately and performance remains optimal.

#### Acceptance Criteria

1. THE System SHALL store Global_Feature_Flag values in a feature_flag table with a single row identified by id "global"
2. THE System SHALL store User_Feature_Flag values in a user_feature_flag table with userId, flagName, and flagValue columns
3. WHEN a feature flag is updated, THE System SHALL persist the change to the database immediately
4. WHEN retrieving feature flags, THE System SHALL query both global and user-specific flags in a single database round-trip where possible
5. THE System SHALL create the user_feature_flag table if it does not exist on first access
6. THE System SHALL index the user_feature_flag table on userId and flagName for query performance
7. WHEN a User_Feature_Flag is set to the same value as the Global_Feature_Flag, THE System SHALL delete the User_Feature_Flag record to minimize storage

### Requirement 16: Owner Dashboard Analytics and Reporting

**User Story:** As the Owner, I want to view analytics and reports on user subscriptions and feature usage, so that I can make informed decisions about platform growth and feature development.

#### Acceptance Criteria

1. THE Owner_Dashboard SHALL display the total count of registered users
2. THE Owner_Dashboard SHALL display the count of Trial_User accounts
3. THE Owner_Dashboard SHALL display the count of Subscribed_User accounts (active subscriptions)
4. THE Owner_Dashboard SHALL display the count of expired or cancelled subscriptions
5. THE Owner_Dashboard SHALL display the count of suspended users
6. THE Owner_Dashboard SHALL display monthly recurring revenue (MRR) based on active subscriptions
7. THE Owner_Dashboard SHALL display annual recurring revenue (ARR) based on active subscriptions

### Requirement 17: Subscription Status Synchronization

**User Story:** As a user, I want my subscription status to be synchronized accurately across all payment providers, so that my access is consistent regardless of payment method.

#### Acceptance Criteria

1. WHEN a Stripe webhook is received, THE System SHALL update the subscription record with the new status and periodEnd
2. WHEN a NowPayments webhook is received, THE System SHALL update the subscription record with the new status and periodEnd
3. THE System SHALL handle webhook retries idempotently to prevent duplicate updates
4. WHEN a subscription status changes, THE System SHALL invalidate cached entitlements for the affected user
5. THE System SHALL log all webhook events for audit and debugging purposes
6. IF a webhook signature validation fails, THEN THE System SHALL reject the webhook and log a security warning
7. THE System SHALL process webhooks asynchronously to prevent blocking the webhook response

### Requirement 18: User Account Section Billing History

**User Story:** As a Subscribed_User, I want to view my billing history, so that I can track my payments and download invoices.

#### Acceptance Criteria

1. THE User_Account_Section SHALL display a billing history section for Subscribed_User accounts
2. THE System SHALL retrieve billing history from Stripe for Stripe subscriptions
3. THE System SHALL display each invoice with date, amount, status, and a download link
4. WHEN a user clicks an invoice download link, THE System SHALL retrieve the invoice PDF from Stripe and serve it to the user
5. THE System SHALL display manual renewal records in the billing history with the invoiceRef and notes
6. THE System SHALL sort billing history by date in descending order (most recent first)
7. IF billing history retrieval fails, THEN THE System SHALL display an error message and provide a retry option

### Requirement 19: Mobile Responsive Design

**User Story:** As a mobile user, I want all subscription and account management interfaces to be fully responsive, so that I can manage my account from any device.

#### Acceptance Criteria

1. THE User_Account_Section SHALL render correctly on screen widths from 320px to 2560px
2. THE Owner_Dashboard SHALL render correctly on screen widths from 768px to 2560px
3. THE System SHALL use responsive layout techniques (flexbox, grid) to adapt to different screen sizes
4. THE System SHALL provide touch-friendly controls with minimum 44px touch targets on mobile devices
5. THE System SHALL optimize font sizes for readability on small screens
6. THE System SHALL collapse navigation menus into a hamburger menu on screens smaller than 768px
7. THE System SHALL test responsive design on iOS Safari, Android Chrome, and desktop browsers

### Requirement 20: Error Handling and User Feedback

**User Story:** As a user, I want clear error messages and feedback when operations fail, so that I understand what went wrong and how to resolve the issue.

#### Acceptance Criteria

1. WHEN a subscription operation fails, THE System SHALL display a user-friendly error message explaining the failure
2. THE System SHALL distinguish between user errors (invalid input) and system errors (service unavailable)
3. WHEN a payment fails, THE System SHALL display the specific payment error from the payment provider
4. THE System SHALL provide actionable guidance in error messages (e.g., "Please check your card details and try again")
5. WHEN an operation succeeds, THE System SHALL display a success message confirming the action
6. THE System SHALL use consistent visual styling for error messages (red/rose theme) and success messages (green/emerald theme)
7. THE System SHALL log all errors to the server console with sufficient context for debugging

## Parser and Serializer Requirements

This feature does not include parsers or serializers. All data exchange uses standard JSON serialization provided by the framework.

## Notes

- The existing `lib/entitlements.ts` module will be extended to support per-user feature flag lookups
- The existing `lib/feature-flags.ts` module will be extended to support user-specific flag storage and retrieval
- The existing `app/admin/page.tsx` will be enhanced with per-user feature flag controls
- A new user account section will be created at `app/account/page.tsx` separate from the subscription page
- The subscription page at `app/subscription/page.tsx` will be refactored to focus on plan selection and payment
- All database schema changes will be implemented using Prisma migrations or raw SQL with proper error handling
- The system will maintain backward compatibility with existing global feature flags during the transition
