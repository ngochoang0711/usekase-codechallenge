import { describe, expect, it } from 'vitest';
import { computeAvailability, isHoldLive } from './availability';

describe('computeAvailability', () => {
  it('reports seats left as capacity minus confirmed and live holds combined', () => {
    // Last Four Seats fixture shape: capacity 4, 2 confirmed, 1 live hold.
    expect(computeAvailability(4, 2, 1)).toEqual({
      seatsLeft: 1,
      isSoldOut: false,
      isTemporarilyUnavailable: false,
    });
  });

  it('is sold out when confirmed bookings alone fill capacity', () => {
    const result = computeAvailability(4, 4, 0);
    expect(result.isSoldOut).toBe(true);
    expect(result.isTemporarilyUnavailable).toBe(false);
    expect(result.seatsLeft).toBe(0);
  });

  it('is temporarily unavailable, not sold out, when holds (not confirmed bookings) fill the rest', () => {
    const result = computeAvailability(4, 2, 2);
    expect(result.isSoldOut).toBe(false);
    expect(result.isTemporarilyUnavailable).toBe(true);
    expect(result.seatsLeft).toBe(0);
  });

  it('treats a zero-capacity show as sold out, not temporarily unavailable', () => {
    // "Sold Out Before It Began" fixture: capacity 0, not cancelled.
    const result = computeAvailability(0, 0, 0);
    expect(result.isSoldOut).toBe(true);
    expect(result.isTemporarilyUnavailable).toBe(false);
    expect(result.seatsLeft).toBe(0);
  });

  it('never reports negative seats left if committed somehow exceeds capacity', () => {
    expect(computeAvailability(4, 5, 0).seatsLeft).toBe(0);
  });
});

describe('isHoldLive', () => {
  const now = new Date('2026-01-01T00:00:00Z');

  it('is live when not released and not yet expired', () => {
    expect(isHoldLive({ releasedAt: null, expiresAt: new Date('2026-01-01T00:01:00Z') }, now)).toBe(
      true,
    );
  });

  it('is not live once released, even if not yet expired', () => {
    expect(
      isHoldLive(
        { releasedAt: new Date('2025-12-31T23:59:00Z'), expiresAt: new Date('2026-01-01T00:01:00Z') },
        now,
      ),
    ).toBe(false);
  });

  it('is not live once expired', () => {
    expect(isHoldLive({ releasedAt: null, expiresAt: new Date('2025-12-31T23:59:00Z') }, now)).toBe(
      false,
    );
  });

  it('treats the exact expiry instant as already expired (boundary is exclusive)', () => {
    // db/seed.sql's "sess-boundary" fixture: expires_at = now() at seed time.
    expect(isHoldLive({ releasedAt: null, expiresAt: now }, now)).toBe(false);
  });
});
