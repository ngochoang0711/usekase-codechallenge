import { withRls } from './client';

export interface OrganiserVenue {
  id: string;
  name: string;
  city: string;
  timezone: string;
}

export async function listOrganiserVenues(organiserId: string): Promise<OrganiserVenue[]> {
  const { rows } = await withRls('authenticated', { organiser_id: organiserId }, (client) =>
    client.query<OrganiserVenue>('select id, name, city, timezone from venue order by name'),
  );
  return rows;
}
