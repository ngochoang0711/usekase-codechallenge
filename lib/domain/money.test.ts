import { describe, expect, it } from 'vitest';
import {
  computeBookingFeeMinor,
  computeGrandTotalMinor,
  computeLineTotalMinor,
  computeTierPriceMinor,
} from './money';

// Every case below is pinned to an actual row in db/seed.sql -- these
// numbers are not invented, they're what the seed data already asserts is
// correct (see the comments next to each booking insert).
describe('money (pinned against db/seed.sql)', () => {
  it('full price ticket: Hungry Ghost Karaoke, 2x full, base_price 3200', () => {
    const tierPrice = computeTierPriceMinor(3200, 'full');
    const lineTotal = computeLineTotalMinor(tierPrice, 2);
    const fee = computeBookingFeeMinor(lineTotal);
    expect(lineTotal).toBe(6400);
    expect(fee).toBe(384);
    expect(computeGrandTotalMinor(lineTotal, fee)).toBe(6784);
  });

  it('concession ticket: Last Four Seats, 1x concession, base_price 4500', () => {
    const tierPrice = computeTierPriceMinor(4500, 'concession');
    expect(tierPrice).toBe(3150);
    const lineTotal = computeLineTotalMinor(tierPrice, 1);
    const fee = computeBookingFeeMinor(lineTotal);
    expect(fee).toBe(189);
    expect(computeGrandTotalMinor(lineTotal, fee)).toBe(3339);
  });

  it('fee cap: Gala Night, 5x full, base_price 18000 -- 6% would be 5400, capped at 900', () => {
    const lineTotal = computeLineTotalMinor(computeTierPriceMinor(18000, 'full'), 5);
    expect(lineTotal).toBe(90000);
    const fee = computeBookingFeeMinor(lineTotal);
    expect(fee).toBe(900);
    expect(computeGrandTotalMinor(lineTotal, fee)).toBe(90900);
  });

  it('free show: booking fee on zero is zero, not an error', () => {
    const lineTotal = computeLineTotalMinor(computeTierPriceMinor(0, 'full'), 3);
    expect(lineTotal).toBe(0);
    expect(computeBookingFeeMinor(lineTotal)).toBe(0);
  });

  it('rounds tier pricing that does not divide cleanly (Three For Odd Money, base_price 999)', () => {
    expect(computeTierPriceMinor(999, 'full')).toBe(999);
    expect(computeTierPriceMinor(999, 'concession')).toBe(699); // 699.3 -> 699
    expect(computeTierPriceMinor(999, 'under26')).toBe(500); // 499.5 -> 500 (round-half-up)
  });

  it('grand total always equals line total plus fee', () => {
    const lineTotal = 12_345;
    const fee = computeBookingFeeMinor(lineTotal);
    expect(computeGrandTotalMinor(lineTotal, fee)).toBe(lineTotal + fee);
  });
});
