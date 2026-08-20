import { notFound } from 'next/navigation';
import { computeAvailability } from '../../../lib/domain/availability';
import { computeTierPriceMinor } from '../../../lib/domain/money';
import type { Tier } from '../../../lib/domain/types';
import { formatInVenueTimezone } from '../../../lib/domain/time';
import { getLiveHoldForSessionAndShow } from '../../../lib/db/holds';
import { getPublicShowById } from '../../../lib/db/shows';
import { getSessionRef } from '../../../lib/session';
import { HoldPanel } from './HoldPanel';

const TIER_LABELS: Record<Tier, string> = {
  full: 'Full price',
  concession: 'Concession',
  under26: 'Under 26',
};

// A plain helper, not the component body: RLS already hides draft/
// cancelled/past shows from getPublicShowById (db/policies.sql's
// show_public_read policy is the actual security boundary), so this is
// only a UI-level double-check -- pulled out of the component so the
// wall-clock read doesn't run inside a function React's purity lint
// treats as a render body.
function isStillBookable(show: { status: string; startsAt: Date }): boolean {
  return show.status === 'on_sale' && show.startsAt.getTime() > Date.now();
}

export default async function ShowDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const show = await getPublicShowById(id);
  if (!show || !isStillBookable(show)) {
    notFound();
  }

  const sessionRef = await getSessionRef();
  const [availability, existingHold] = await Promise.all([
    Promise.resolve(computeAvailability(show.capacity, show.confirmedQty, show.liveHoldQty)),
    getLiveHoldForSessionAndShow(show.id, sessionRef),
  ]);

  const tierOptions = (['full', 'concession', 'under26'] as const).map((tier) => ({
    tier,
    label: TIER_LABELS[tier],
    priceMinor: computeTierPriceMinor(show.basePriceMinor, tier),
  }));

  const statusLabel = availability.isSoldOut
    ? 'Sold out'
    : availability.isTemporarilyUnavailable
      ? 'Temporarily unavailable -- seats may free up as baskets expire'
      : `${availability.seatsLeft} seat${availability.seatsLeft === 1 ? '' : 's'} left`;

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-3xl font-semibold">{show.title}</h1>
      <p className="mt-2 opacity-70">
        {show.venueName}, {show.venueCity} · {formatInVenueTimezone(show.startsAt, show.venueTimezone)}
      </p>
      {show.blurb && <p className="mt-4">{show.blurb}</p>}
      <p className="mt-4 text-sm opacity-70">{statusLabel}</p>

      <div className="mt-6">
        <HoldPanel
          showId={show.id}
          currency={show.currency}
          tierOptions={tierOptions}
          initialSeatsLeft={availability.seatsLeft}
          existingHold={
            existingHold
              ? {
                  holdId: existingHold.id,
                  quantity: existingHold.quantity,
                  tier: existingHold.tier,
                  expiresAtIso: existingHold.expiresAt.toISOString(),
                }
              : null
          }
        />
      </div>
    </main>
  );
}
