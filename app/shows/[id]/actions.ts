'use server';

import { revalidatePath } from 'next/cache';
import { MAX_HOLD_QUANTITY } from '../../../lib/domain/availability';
import { computeBookingFeeMinor, computeLineTotalMinor, computeTierPriceMinor } from '../../../lib/domain/money';
import type { Tier } from '../../../lib/domain/types';
import {
  confirmHold,
  createHold,
  DuplicateHoldError,
  getHoldForSession,
  HoldExpiredError,
  HoldNotFoundError,
  HoldQuantityLimitError,
  ShowNotBookableError,
  ShowNotFoundError,
  SoldOutError,
} from '../../../lib/db/holds';
import { getPublicShowById } from '../../../lib/db/shows';
import { getSessionRef } from '../../../lib/session';

const TIERS: readonly Tier[] = ['full', 'concession', 'under26'];

export type CreateHoldResult =
  | { ok: true; holdId: string; quantity: number; tier: Tier; expiresAtIso: string }
  | { ok: false; error: string };

export async function createHoldForShow(showId: string, formData: FormData): Promise<CreateHoldResult> {
  const sessionRef = await getSessionRef();
  const quantity = Number(formData.get('quantity'));
  const tierRaw = String(formData.get('tier'));

  if (!Number.isInteger(quantity) || quantity <= 0) {
    return { ok: false, error: 'Choose a valid number of tickets.' };
  }
  if (quantity > MAX_HOLD_QUANTITY) {
    return { ok: false, error: `A basket is limited to ${MAX_HOLD_QUANTITY} tickets.` };
  }
  if (!TIERS.includes(tierRaw as Tier)) {
    return { ok: false, error: 'Choose a valid ticket type.' };
  }

  try {
    const hold = await createHold({ showId, quantity, tier: tierRaw as Tier, sessionRef });
    revalidatePath(`/shows/${showId}`);
    return {
      ok: true,
      holdId: hold.id,
      quantity: hold.quantity,
      tier: hold.tier,
      expiresAtIso: hold.expiresAt.toISOString(),
    };
  } catch (error) {
    if (error instanceof SoldOutError) return { ok: false, error: 'Sorry -- not enough seats left right now.' };
    if (error instanceof ShowNotBookableError) return { ok: false, error: 'This show is no longer bookable.' };
    if (error instanceof ShowNotFoundError) return { ok: false, error: 'Show not found.' };
    if (error instanceof DuplicateHoldError) {
      return { ok: false, error: 'You already have a basket open for this show -- check your other tab.' };
    }
    if (error instanceof HoldQuantityLimitError) {
      return { ok: false, error: `A basket is limited to ${MAX_HOLD_QUANTITY} tickets.` };
    }
    throw error;
  }
}

export type ConfirmHoldResult =
  | { ok: true; bookingId: string; grandTotalMinor: number }
  | { ok: false; error: string };

export async function confirmHoldForShow(holdId: string, formData: FormData): Promise<ConfirmHoldResult> {
  const sessionRef = await getSessionRef();
  const buyerEmail = String(formData.get('buyerEmail') ?? '').trim();
  if (!buyerEmail.includes('@')) {
    return { ok: false, error: 'Enter a valid email address.' };
  }

  const hold = await getHoldForSession(holdId, sessionRef);
  if (!hold) return { ok: false, error: 'Hold not found, or it belongs to someone else.' };

  const show = await getPublicShowById(hold.showId);
  if (!show) return { ok: false, error: 'This show is no longer available.' };

  const tierPriceMinor = computeTierPriceMinor(show.basePriceMinor, hold.tier);
  const lineTotalMinor = computeLineTotalMinor(tierPriceMinor, hold.quantity);
  const bookingFeeMinor = computeBookingFeeMinor(lineTotalMinor);

  try {
    const booking = await confirmHold({ holdId, buyerEmail, lineTotalMinor, bookingFeeMinor });
    revalidatePath(`/shows/${hold.showId}`);
    return { ok: true, bookingId: booking.id, grandTotalMinor: booking.grandTotalMinor };
  } catch (error) {
    if (error instanceof HoldExpiredError) {
      return { ok: false, error: 'Your hold expired before you confirmed. Please try again.' };
    }
    if (error instanceof SoldOutError) return { ok: false, error: 'Sorry -- this show sold out.' };
    if (error instanceof HoldNotFoundError) return { ok: false, error: 'Hold not found.' };
    throw error;
  }
}
