import { signInAsOrganiser } from './actions';

const SEEDED_ORGANISERS = [
  { id: '0a000000-0000-0000-0000-000000000001', name: 'Mei Chen', venues: 'Black Box @ Bugis, The Attic' },
  { id: '0a000000-0000-0000-0000-000000000002', name: 'Darren Blake', venues: 'The Loft (Melbourne), Kathmandu Courtyard' },
];

export default function OrganiserLoginPage() {
  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-2xl font-semibold">Organiser sign in</h1>
      <p className="mt-2 text-sm opacity-70">
        No password in this build -- pick one of the seeded organisers. See docs/SETUP.md.
      </p>
      <div className="mt-6 flex flex-col gap-3">
        {SEEDED_ORGANISERS.map((organiser) => (
          <form key={organiser.id} action={signInAsOrganiser.bind(null, organiser.id)}>
            <button
              type="submit"
              className="w-full rounded-lg border border-white/15 p-4 text-left transition hover:bg-white/5"
            >
              <div className="font-medium">{organiser.name}</div>
              <div className="text-sm opacity-60">{organiser.venues}</div>
            </button>
          </form>
        ))}
      </div>
    </main>
  );
}
