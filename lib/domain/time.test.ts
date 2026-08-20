import { describe, expect, it } from 'vitest';
import { formatInVenueTimezone, localDateRangeUtc, zonedTimeToUtc } from './time';

// FRG-121: "a show listed as 2am was actually on at 1am". Repro: The 2am
// Monologue (db/seed.sql) is 2026-10-04 15:30:00+00 at a Melbourne venue.
// Melbourne switches to AEDT (+11) at 2am AEST on the first Sunday of
// October -- 2026-10-04 -- so by 15:30 UTC that day Melbourne has already
// moved to +11. A fixed +10 (AEST, no DST) offset gives 01:30; the correct
// answer, using the real IANA zone at that instant, is 02:30 the next day.
describe('formatInVenueTimezone (FRG-121 repro)', () => {
  it('renders the DST-boundary show at its correct local time, not one hour off', () => {
    const showInstant = new Date('2026-10-04T15:30:00Z');
    const formatted = formatInVenueTimezone(showInstant, 'Australia/Melbourne');

    expect(formatted).toContain('5 Oct 2026');
    expect(formatted).toContain('2:30');
    expect(formatted).not.toContain('1:30');
  });

  it('renders a Singapore show unaffected, since SGT never observes DST', () => {
    const showInstant = new Date('2026-08-21T12:00:00Z'); // 20:00 SGT
    expect(formatInVenueTimezone(showInstant, 'Asia/Singapore')).toContain('8:00');
  });

  it('renders a Kathmandu show correctly with its +05:45 offset', () => {
    const showInstant = new Date('2026-01-15T10:00:00Z'); // 15:45 Kathmandu
    expect(formatInVenueTimezone(showInstant, 'Asia/Kathmandu')).toContain('3:45');
  });
});

describe('zonedTimeToUtc', () => {
  it('resolves a local wall-clock time back to the correct UTC instant, including a half-hour zone', () => {
    const resolved = zonedTimeToUtc({ year: 2026, month: 1, day: 15, hour: 15, minute: 45 }, 'Asia/Kathmandu');
    expect(resolved.toISOString()).toBe('2026-01-15T10:00:00.000Z');
  });

  it('round-trips through a DST transition', () => {
    const resolved = zonedTimeToUtc(
      { year: 2026, month: 10, day: 5, hour: 2, minute: 30 },
      'Australia/Melbourne',
    );
    expect(resolved.toISOString()).toBe('2026-10-04T15:30:00.000Z');
  });
});

describe('localDateRangeUtc (FRG-130 onDate semantics)', () => {
  it('spans the correct UTC instants for a local calendar date, even across a DST transition', () => {
    // Local Oct 4 in Melbourne is only 23 hours long (clocks spring forward
    // at 2am), which is exactly why this can't be computed with a fixed offset.
    const { start, end } = localDateRangeUtc('2026-10-04', 'Australia/Melbourne');
    expect(start.toISOString()).toBe('2026-10-03T14:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-04T13:00:00.000Z');
  });

  it('places the DST-boundary show on the date its own audience would call it', () => {
    const showInstant = new Date('2026-10-04T15:30:00Z');
    const { start, end } = localDateRangeUtc('2026-10-05', 'Australia/Melbourne');
    expect(showInstant.getTime()).toBeGreaterThanOrEqual(start.getTime());
    expect(showInstant.getTime()).toBeLessThan(end.getTime());
  });
});
