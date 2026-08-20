import { redirect } from 'next/navigation';
import { listOrganiserVenues } from '../../../../lib/db/venues';
import { getOrganiserId } from '../../../../lib/session';
import { createShowAction } from '../../actions';
import { ShowForm } from '../../ShowForm';

export default async function NewShowPage() {
  const organiserId = await getOrganiserId();
  if (!organiserId) redirect('/organiser/login');

  const venues = await listOrganiserVenues(organiserId);

  return (
    <main className="mx-auto max-w-lg p-8">
      <h1 className="text-2xl font-semibold">New show</h1>
      <ShowForm venues={venues} action={createShowAction} submitLabel="Create show" />
    </main>
  );
}
