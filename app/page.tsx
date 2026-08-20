import Link from 'next/link';
import { computeAvailability } from '../lib/domain/availability';
import { computeTierPriceMinor } from '../lib/domain/money';
import { formatInVenueTimezone } from '../lib/domain/time';
import { listDistinctCities, listShows } from '../lib/db/shows';
import { formatMoney } from './format';

const PAGE_SIZE = 10;

function buildPageHref(page: number, city: string | undefined, availableOnly: boolean): string {
  const qs = new URLSearchParams();
  qs.set('page', String(page));
  if (city) qs.set('city', city);
  if (availableOnly) qs.set('availability', 'available');
  return `/?${qs.toString()}`;
}

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; city?: string; availability?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const city = params.city && params.city !== 'all' ? params.city : undefined;
  const availableOnly = params.availability === 'available';

  const [cities, { shows, totalCount }] = await Promise.all([
    listDistinctCities(),
    listShows({ page, pageSize: PAGE_SIZE, city, availableOnly }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <main className="mx-auto max-w-4xl p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold">Fringe</h1>
        <Link href="/organiser" className="text-sm underline opacity-70 hover:opacity-100">
          Organiser sign in
        </Link>
      </header>

      <form className="mt-6 flex flex-wrap items-center gap-3" method="get">
        <select
          name="city"
          defaultValue={city ?? 'all'}
          className="rounded-lg border border-white/15 bg-transparent p-2 text-sm"
        >
          <option value="all" className="bg-black">
            All cities
          </option>
          {cities.map((c) => (
            <option key={c} value={c} className="bg-black">
              {c}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="availability" value="available" defaultChecked={availableOnly} />
          Available now only
        </label>
        <button type="submit" className="rounded-lg bg-white/10 px-4 py-2 text-sm">
          Apply
        </button>
      </form>

      <p className="mt-4 text-sm opacity-60">
        {totalCount} show{totalCount === 1 ? '' : 's'} found, sorted by start time
      </p>

      {shows.length === 0 ? (
        <p className="mt-8 rounded-lg border border-white/10 p-8 text-center opacity-70">
          No shows match those filters. Try widening your search.
        </p>
      ) : (
        <ul className="mt-6 flex flex-col gap-4">
          {shows.map((show) => {
            const availability = computeAvailability(show.capacity, show.confirmedQty, show.liveHoldQty);
            const priceFrom = computeTierPriceMinor(show.basePriceMinor, 'under26');
            const statusLabel = availability.isSoldOut
              ? 'Sold out'
              : availability.isTemporarilyUnavailable
                ? 'Temporarily unavailable'
                : `${availability.seatsLeft} left`;
            const statusClass = availability.isSoldOut
              ? 'text-red-400'
              : availability.isTemporarilyUnavailable
                ? 'text-amber-400'
                : 'opacity-70';

            return (
              <li key={show.id}>
                <Link
                  href={`/shows/${show.id}`}
                  className="block rounded-lg border border-white/10 p-4 transition hover:bg-white/5"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="font-medium">{show.title}</div>
                      <div className="text-sm opacity-70">
                        {show.venueName}, {show.venueCity} ·{' '}
                        {formatInVenueTimezone(show.startsAt, show.venueTimezone)}
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-sm">
                      <div>From {formatMoney(priceFrom, show.currency)}</div>
                      <div className={statusClass}>{statusLabel}</div>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <nav className="mt-8 flex items-center justify-between text-sm">
        {page > 1 ? (
          <Link href={buildPageHref(page - 1, city, availableOnly)} className="underline">
            Previous
          </Link>
        ) : (
          <span className="opacity-30">Previous</span>
        )}
        <span className="opacity-60">
          Page {page} of {totalPages}
        </span>
        {page < totalPages ? (
          <Link href={buildPageHref(page + 1, city, availableOnly)} className="underline">
            Next
          </Link>
        ) : (
          <span className="opacity-30">Next</span>
        )}
      </nav>
    </main>
  );
}
