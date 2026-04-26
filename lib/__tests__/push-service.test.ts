import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock web-push before importing the module under test ──────────────────────
vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
}));

import webpush from 'web-push';
import {
  sendPushNotification,
  sendPushNotificationWithRetry,
  getVapidStatus,
} from '../push-service';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSub(endpoint = 'https://push.example.com/sub/abc123xyz') {
  return { endpoint, p256dh: 'p256dh-key', auth: 'auth-key' };
}

function makePayload() {
  return { title: 'BTC BUY', body: '1m RSI reached 28.5' };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();

  // Provide VAPID keys so ensureVapidInitialized() succeeds
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'test-public-key';
  process.env.VAPID_PRIVATE_KEY = 'test-private-key';

  // Reset the module-level singleton between tests by re-importing
  // (vitest isolates modules per test file, but the singleton persists within
  //  the file - we reset it by clearing the mock and letting the first call
  //  re-initialize via setVapidDetails)
});

afterEach(() => {
  vi.useRealTimers();
});

// ── sendPushNotification (backward-compat) ────────────────────────────────────

describe('sendPushNotification', () => {
  it('returns { success: true } on successful send', async () => {
    vi.mocked(webpush.sendNotification).mockResolvedValueOnce(undefined as any);

    const result = await sendPushNotification(makeSub(), makePayload());
    expect(result).toEqual({ success: true });
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
  });

  it('returns { success: false, expired: true } for 410 status', async () => {
    const err: any = new Error('Gone');
    err.statusCode = 410;
    vi.mocked(webpush.sendNotification).mockRejectedValueOnce(err);

    const result = await sendPushNotification(makeSub(), makePayload());
    expect(result).toEqual({ success: false, expired: true });
  });

  it('returns { success: false, expired: true } for 404 status', async () => {
    const err: any = new Error('Not Found');
    err.statusCode = 404;
    vi.mocked(webpush.sendNotification).mockRejectedValueOnce(err);

    const result = await sendPushNotification(makeSub(), makePayload());
    expect(result).toEqual({ success: false, expired: true });
  });

  it('returns { success: false, error } for generic errors', async () => {
    const err = new Error('Network error');
    vi.mocked(webpush.sendNotification).mockRejectedValueOnce(err);

    const result = await sendPushNotification(makeSub(), makePayload());
    expect(result.success).toBe(false);
    expect(result.error).toBe(err);
  });
});

// ── sendPushNotificationWithRetry ─────────────────────────────────────────────

describe('sendPushNotificationWithRetry', () => {
  it('returns { success: true } when first attempt succeeds', async () => {
    vi.mocked(webpush.sendNotification).mockResolvedValueOnce(undefined as any);

    const result = await sendPushNotificationWithRetry(makeSub(), makePayload());
    expect(result).toEqual({ success: true });
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
  });

  it('returns { success: false, expired: true } for 410 without retrying', async () => {
    const err: any = new Error('Gone');
    err.statusCode = 410;
    vi.mocked(webpush.sendNotification).mockRejectedValue(err);

    const result = await sendPushNotificationWithRetry(makeSub(), makePayload());
    expect(result).toEqual({ success: false, expired: true });
    // Must NOT retry - only one call
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
  });

  it('returns { success: false, expired: true } for 404 without retrying', async () => {
    const err: any = new Error('Not Found');
    err.statusCode = 404;
    vi.mocked(webpush.sendNotification).mockRejectedValue(err);

    const result = await sendPushNotificationWithRetry(makeSub(), makePayload());
    expect(result).toEqual({ success: false, expired: true });
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
  });

  it('retries up to maxRetries times on transient failure', async () => {
    const err = new Error('Service Unavailable');
    vi.mocked(webpush.sendNotification)
      .mockRejectedValueOnce(err)
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce(undefined as any); // succeeds on 3rd attempt

    const promise = sendPushNotificationWithRetry(makeSub(), makePayload(), 3);

    // Advance timers for the two backoff delays (1s + 2s)
    await vi.advanceTimersByTimeAsync(1000); // after attempt 1 fails
    await vi.advanceTimersByTimeAsync(2000); // after attempt 2 fails

    const result = await promise;
    expect(result).toEqual({ success: true });
    expect(webpush.sendNotification).toHaveBeenCalledTimes(3);
  });

  it('uses exponential backoff delays: 1s then 2s', async () => {
    const err = new Error('Transient');
    vi.mocked(webpush.sendNotification)
      .mockRejectedValueOnce(err)
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce(undefined as any);

    const setTimeoutSpy = vi.spyOn(global, 'setTimeout');

    const promise = sendPushNotificationWithRetry(makeSub(), makePayload(), 3);
    await vi.runAllTimersAsync();
    await promise;

    // Extract delay values from setTimeout calls (filter out vitest internals)
    const delays = setTimeoutSpy.mock.calls
      .map((args) => args[1] as number)
      .filter((d) => d === 1000 || d === 2000 || d === 4000);

    expect(delays).toContain(1000); // attempt 1 → 2^0 * 1000
    expect(delays).toContain(2000); // attempt 2 → 2^1 * 1000
  });

  it('exhausts all retries and returns { success: false } on final failure', async () => {
    const err = new Error('Persistent failure');
    vi.mocked(webpush.sendNotification).mockRejectedValue(err);

    const promise = sendPushNotificationWithRetry(makeSub(), makePayload(), 3);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(false);
    expect(webpush.sendNotification).toHaveBeenCalledTimes(3);
  });

  it('logs error with truncated endpoint on final failure', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = new Error('Persistent failure');
    vi.mocked(webpush.sendNotification).mockRejectedValue(err);

    const promise = sendPushNotificationWithRetry(makeSub(), makePayload(), 3);
    await vi.runAllTimersAsync();
    await promise;

    expect(consoleSpy).toHaveBeenCalledWith(
      '[push-service] Push notification failed after retries',
      expect.objectContaining({
        endpoint: expect.stringMatching(/^\.\.\./),
        attempts: 3,
      }),
    );
    consoleSpy.mockRestore();
  });

  it('retries with longer delay on 429 rate limit', async () => {
    const rateLimitErr: any = new Error('Too Many Requests');
    rateLimitErr.statusCode = 429;
    vi.mocked(webpush.sendNotification)
      .mockRejectedValueOnce(rateLimitErr)
      .mockResolvedValueOnce(undefined as any);

    const setTimeoutSpy = vi.spyOn(global, 'setTimeout');

    const promise = sendPushNotificationWithRetry(makeSub(), makePayload(), 3);
    await vi.runAllTimersAsync();
    await promise;

    // 429 on attempt 1: delay = 2^0 * 1000 * 2 = 2000ms
    const delays = setTimeoutSpy.mock.calls
      .map((args) => args[1] as number)
      .filter((d) => d === 2000);

    expect(delays.length).toBeGreaterThanOrEqual(1);
  });
});

// ── getVapidStatus ────────────────────────────────────────────────────────────

describe('getVapidStatus', () => {
  it('reports hasKeys: true when env vars are set', () => {
    const status = getVapidStatus();
    expect(status.hasKeys).toBe(true);
  });

  it('reports hasKeys: false when env vars are missing', () => {
    const origPub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const origPriv = process.env.VAPID_PRIVATE_KEY;
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;

    const status = getVapidStatus();
    expect(status.hasKeys).toBe(false);

    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = origPub;
    process.env.VAPID_PRIVATE_KEY = origPriv;
  });
});
