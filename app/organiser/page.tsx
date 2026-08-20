import Link from 'next/link';
import { redirect } from 'next/navigation';
import { computeAvailability } from '../../lib/domain/availability';
import { listOrganiserBookings } from '../../lib/db/bookings';
import { listOrganiserShows } from '../../lib/db/shows';
import { getOrganiserId } from '../../lib/session';
import { formatMoney, formatUtc } from '../format';
import { signOutOrganiser } from './login/actions';

export default async function OrganiserDashboardPage() {
  const organiserId = await getOrganiserId();
  if (!organiserId) {
    redirect('/organiser/login');
  }

  const [shows, bookings] = await Promise.all([
    listOrganiserShows(organiserId),
    listOrganiserBookings(organiserId),
  ]);

  return (
    <main className="mx-auto max-w-4xl p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your shows</h1>
        <div className="flex gap-3">
          <Link href="/organiser/shows/new" className="rounded-lg bg-white/10 px-4 py-2 text-sm">
            New show
          </Link>
          <form action={signOutOrganiser}>
            <button type="submit" className="text-sm opacity-60 hover:opacity-100">
              Sign out
            </button>
          </form>
        </div>
      </div>

      <ul className="mt-6 flex flex-col gap-3">
        {shows.length === 0 && <p className="opacity-60">No shows yet.</p>}
        {shows.map((show) => {
          const availability = computeAvailability(show.capacity, show.confirmedQty, show.liveHoldQty);
          return (
            <li key={show.id} className="rounded-lg border border-white/10 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{show.title}</div>
                  <div className="text-sm opacity-60">
                    {show.status} · {availability.seatsLeft} of {show.capacity} seats left
                  </div>
                </div>
                <Link
                  href={`/organiser/shows/${show.id}/edit`}
                  className="text-sm underline opacity-80 hover:opacity-100"
                >
                  Edit
                </Link>
              </div>
            </li>
          );
        })}
      </ul>

      <h2 className="mt-10 text-xl font-semibold">Your bookings</h2>
      <ul className="mt-4 flex flex-col gap-2">
        {bookings.length === 0 && <p className="opacity-60">No bookings yet.</p>}
        {bookings.map((booking) => (
          <li key={booking.id} className="rounded-lg border border-white/10 p-3 text-sm">
            <span className="font-medium">{booking.showTitle}</span> -- {booking.buyerEmail},{' '}
            {booking.quantity}x {booking.tier}, {formatMoney(booking.grandTotalMinor)}{' '}
            <span className="opacity-60">(confirmed {formatUtc(booking.confirmedAt)})</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
