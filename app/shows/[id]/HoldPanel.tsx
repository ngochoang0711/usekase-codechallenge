'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MAX_HOLD_QUANTITY } from '../../../lib/domain/availability';
import type { Tier } from '../../../lib/domain/types';
import { formatMoney } from '../../format';
import { confirmHoldForShow, createHoldForShow } from './actions';

export interface TierOption {
  tier: Tier;
  label: string;
  priceMinor: number;
}

export interface ExistingHold {
  holdId: string;
  quantity: number;
  tier: Tier;
  expiresAtIso: string;
}

interface ConfirmedBooking {
  bookingId: string;
  grandTotalMinor: number;
}

function useCountdown(expiresAtIso: string | null): number {
  const [remainingMs, setRemainingMs] = useState(() =>
    expiresAtIso ? new Date(expiresAtIso).getTime() - Date.now() : 0,
  );

  useEffect(() => {
    if (!expiresAtIso) return;
    const target = new Date(expiresAtIso).getTime();
    const tick = () => setRemainingMs(target - Date.now());
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [expiresAtIso]);

  return Math.max(0, remainingMs);
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function HoldPanel({
  showId,
  currency,
  tierOptions,
  initialSeatsLeft,
  existingHold,
}: {
  showId: string;
  currency: string;
  tierOptions: TierOption[];
  initialSeatsLeft: number;
  existingHold: ExistingHold | null;
}) {
  const router = useRouter();
  const [hold, setHold] = useState<ExistingHold | null>(existingHold);
  const [confirmed, setConfirmed] = useState<ConfirmedBooking | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [tier, setTier] = useState<Tier>('full');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const remainingMs = useCountdown(confirmed ? null : hold?.expiresAtIso ?? null);
  const hasExpired = hold !== null && !confirmed && remainingMs <= 0;
  // Derived during render, not cleared via setState in an effect: the
  // instant the countdown reaches zero, the hold is already dead
  // server-side (db/functions.sql's `expires_at > now()` check), so the
  // UI should stop treating it as live in the same render, not one render
  // later once an effect gets around to it.
  const activeHold = hasExpired ? null : hold;

  useEffect(() => {
    if (hasExpired) {
      router.refresh(); // seats freed up server-side the instant expiry passed -- reflect it
    }
  }, [hasExpired, router]);

  const selectedTierOption = useMemo(
    () => tierOptions.find((option) => option.tier === tier) ?? tierOptions[0],
    [tierOptions, tier],
  );

  async function handleCreateHold(formData: FormData) {
    setPending(true);
    setError(null);
    try {
      const result = await createHoldForShow(showId, formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setHold({
        holdId: result.holdId,
        quantity: result.quantity,
        tier: result.tier,
        expiresAtIso: result.expiresAtIso,
      });
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function handleConfirm(formData: FormData) {
    if (!hold) return;
    setPending(true);
    setError(null);
    try {
      const result = await confirmHoldForShow(hold.holdId, formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setConfirmed({ bookingId: result.bookingId, grandTotalMinor: result.grandTotalMinor });
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  if (confirmed) {
    return (
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-6">
        <h2 className="font-semibold text-emerald-300">Booking confirmed</h2>
        <p className="mt-2 text-sm">
          Total charged: <span className="font-medium">{formatMoney(confirmed.grandTotalMinor, currency)}</span>
        </p>
        <p className="mt-1 text-xs opacity-60">Booking reference: {confirmed.bookingId}</p>
      </div>
    );
  }

  if (activeHold) {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-6">
        <h2 className="font-semibold">Basket held -- confirm before it expires</h2>
        <p className="mt-1 text-2xl font-mono tabular-nums text-amber-300">{formatCountdown(remainingMs)}</p>
        <p className="mt-1 text-sm opacity-70">
          {activeHold.quantity}x {activeHold.tier}
        </p>
        <form action={handleConfirm} className="mt-4 flex flex-col gap-3">
          <input
            type="email"
            name="buyerEmail"
            required
            placeholder="you@example.com"
            className="rounded-lg border border-white/15 bg-transparent p-2"
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-white/10 px-4 py-2 disabled:opacity-50"
          >
            {pending ? 'Confirming...' : 'Confirm booking'}
          </button>
        </form>
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      </div>
    );
  }

  if (initialSeatsLeft <= 0) {
    return (
      <div className="rounded-lg border border-white/10 p-6 text-center opacity-70">
        No seats available right now.
      </div>
    );
  }

  return (
    <form action={handleCreateHold} className="rounded-lg border border-white/10 p-6">
      {hasExpired && (
        <p className="mb-3 text-sm text-amber-300">
          Your basket expired. The seats are back in the pool -- feel free to grab them again.
        </p>
      )}
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm opacity-70">Ticket type</span>
          <select
            name="tier"
            value={tier}
            onChange={(e) => setTier(e.target.value as Tier)}
            className="rounded-lg border border-white/15 bg-transparent p-2"
          >
            {tierOptions.map((option) => (
              <option key={option.tier} value={option.tier} className="bg-black">
                {option.label} -- {formatMoney(option.priceMinor, currency)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm opacity-70">Quantity</span>
          <input
            type="number"
            name="quantity"
            min={1}
            max={Math.min(initialSeatsLeft, MAX_HOLD_QUANTITY)}
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            className="rounded-lg border border-white/15 bg-transparent p-2"
          />
        </label>
        <p className="text-sm opacity-70">
          Line total: {formatMoney((selectedTierOption?.priceMinor ?? 0) * quantity, currency)}
        </p>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-white/10 px-4 py-2 disabled:opacity-50"
        >
          {pending ? 'Holding...' : `Hold ${quantity} ticket${quantity === 1 ? '' : 's'} for 10 minutes`}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </form>
  );
}
