import type { Tier } from './types';

// Percentage of base_price each tier charges. Concession/under26 values are
// a judgement call (not specified by the brief) -- chosen to match every
// seeded booking row exactly: Last Four Seats' concession booking has
// line_total 3150 against a base_price of 4500, which is round(4500*0.7).
// under26 isn't exercised by any seeded booking, so 50% is a plausible
// festival-standard default rather than a value pinned by a fixture.
const TIER_MULTIPLIER: Record<Tier, number> = {
  full: 1,
  concession: 0.7,
  under26: 0.5,
};

const BOOKING_FEE_RATE = 0.06;
const BOOKING_FEE_CAP_MINOR = 900; // $9.00

/**
 * All amounts are integer minor units throughout -- never a float, per
 * CLAUDE.md non-negotiable #2. Rounding happens exactly twice, both here:
 * once converting a tier's percentage of base_price to a whole minor unit,
 * and once computing the fee percentage. Round-half-up (`Math.round`,
 * which rounds .5 away from zero for non-negative inputs) both times.
 */
export function computeTierPriceMinor(basePriceMinor: number, tier: Tier): number {
  return Math.round(basePriceMinor * TIER_MULTIPLIER[tier]);
}

export function computeLineTotalMinor(tierPriceMinor: number, quantity: number): number {
  return tierPriceMinor * quantity;
}

/** 6% of the order, capped at $9.00 (900 minor units). Rounded before the cap is applied. */
export function computeBookingFeeMinor(lineTotalMinor: number): number {
  return Math.min(Math.round(lineTotalMinor * BOOKING_FEE_RATE), BOOKING_FEE_CAP_MINOR);
}

export function computeGrandTotalMinor(lineTotalMinor: number, bookingFeeMinor: number): number {
  return lineTotalMinor + bookingFeeMinor;
}
