export const AUTH_CONFIG = {
  SUPER_ADMIN_EMAIL: process.env.SUPER_ADMIN_EMAIL || "zeeshan.keerio@mindscapeanalytics.com",
  // Hard cap trial at 14 days to guarantee consistent upgrade enforcement.
  TRIAL_DAYS: 14,
  PAST_DUE_GRACE_DAYS: Number(process.env.PAST_DUE_GRACE_DAYS || 7),
} as const;
