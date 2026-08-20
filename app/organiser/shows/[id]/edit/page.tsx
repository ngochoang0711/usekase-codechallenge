import { notFound, redirect } from 'next/navigation';
import { toDatetimeLocalString } from '../../../../../lib/domain/time';
import { listOrganiserShows } from '../../../../../lib/db/shows';
import { listOrganiserVenues } from '../../../../../lib/db/venues';
import { getOrganiserId } from '../../../../../lib/session';
import { updateShowAction } from '../../../actions';
import { ShowForm } from '../../../ShowForm';

export default async function EditShowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const organiserId = await getOrganiserId();
  if (!organiserId) redirect('/organiser/login');

  const [shows, venues] = await Promise.all([
    listOrganiserShows(organiserId),
    listOrganiserVenues(organiserId),
  ]);

  // Not filtering by organiser here would be the read-side version of the
  // exact bug CLAUDE.md warns about -- but listOrganiserShows() already
  // only returns this organiser's own shows via RLS, so a show belonging
  // to someone else simply isn't in this list to find.
  const show = shows.find((s) => s.id === id);
  if (!show) notFound();

  const venue = venues.find((v) => v.id === show.venueId);

  return (
    <main className="mx-auto max-w-lg p-8">
      <h1 className="text-2xl font-semibold">Edit {show.title}</h1>
      <ShowForm
        venues={venues}
        defaults={{
          venueId: show.venueId,
          title: show.title,
          blurb: show.blurb,
          startsAtLocal: venue ? toDatetimeLocalString(show.startsAt, venue.timezone) : undefined,
          durationMins: show.durationMins,
          capacity: show.capacity,
          basePriceMinor: show.basePriceMinor,
          currency: show.currency,
          status: show.status,
        }}
        action={updateShowAction.bind(null, show.id)}
        submitLabel="Save changes"
      />
    </main>
  );
}
