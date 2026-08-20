import { cookies } from 'next/headers';

const SESSION_COOKIE = 'session_ref';
const ORGANISER_COOKIE = 'organiser_id';

/** Set by middleware.ts on first request -- always present by the time a page runs. */
export async function getSessionRef(): Promise<string> {
  const store = await cookies();
  const value = store.get(SESSION_COOKIE)?.value;
  if (!value) {
    throw new Error(`${SESSION_COOKIE} cookie missing -- middleware.ts should have set it`);
  }
  return value;
}

export async function getOrganiserId(): Promise<string | null> {
  const store = await cookies();
  return store.get(ORGANISER_COOKIE)?.value ?? null;
}

/**
 * There is no password: this app stubs organiser auth as a straight pick
 * between the two seeded organisers (see docs/SETUP.md), a deliberate
 * scope cut documented in SOLUTION.md. What's real is everything
 * downstream of this cookie -- every organiser-scoped query still goes
 * through db/policies.sql's RLS using whatever id ends up here.
 */
export async function setOrganiserId(organiserId: string): Promise<void> {
  const store = await cookies();
  store.set(ORGANISER_COOKIE, organiserId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearOrganiserId(): Promise<void> {
  const store = await cookies();
  store.delete(ORGANISER_COOKIE);
}
