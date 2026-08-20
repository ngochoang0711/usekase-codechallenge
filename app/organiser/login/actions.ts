'use server';

import { redirect } from 'next/navigation';
import { clearOrganiserId, setOrganiserId } from '../../../lib/session';

// No password: a stub swap between the two seeded organisers (see
// docs/SETUP.md). Documented as a deliberate scope cut in SOLUTION.md --
// what's real is everything downstream: every organiser-scoped query
// still runs through db/policies.sql's RLS keyed off whatever id lands
// here, which is the property actually being assessed.
const SEEDED_ORGANISERS: Record<string, string> = {
  '0a000000-0000-0000-0000-000000000001': 'Mei Chen',
  '0a000000-0000-0000-0000-000000000002': 'Darren Blake',
};

export async function signInAsOrganiser(organiserId: string): Promise<void> {
  if (!(organiserId in SEEDED_ORGANISERS)) {
    throw new Error('unknown organiser');
  }
  await setOrganiserId(organiserId);
  redirect('/organiser');
}

export async function signOutOrganiser(): Promise<void> {
  await clearOrganiserId();
  redirect('/organiser/login');
}
