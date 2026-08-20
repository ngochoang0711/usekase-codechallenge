import type { Tier } from '../domain/types';
import { withRls } from './client';

export interface OrganiserBooking {
  id: string;
  showId: string;
  showTitle: string;
  buyerEmail: string;
  quantity: number;
  tier: Tier;
  lineTotalMinor: number;
  bookingFeeMinor: number;
  grandTotalMinor: number;
  confirmedAt: Date;
}

interface BookingRow {
  id: string;
  show_id: string;
  show_title: string;
  buyer_email: string;
  quantity: number;
  tier: Tier;
  line_total: string;
  booking_fee: string;
  grand_total: string;
  confirmed_at: Date;
}

function toOrganiserBooking(row: BookingRow): OrganiserBooking {
  return {
    id: row.id,
    showId: row.show_id,
    showTitle: row.show_title,
    buyerEmail: row.buyer_email,
    quantity: row.quantity,
    tier: row.tier,
    lineTotalMinor: Number(row.line_total),
    bookingFeeMinor: Number(row.booking_fee),
    grandTotalMinor: Number(row.grand_total),
    confirmedAt: row.confirmed_at,
  };
}

/**
 * Every confirmed booking for this organiser's own shows. Relies entirely
 * on booking_owner_read in db/policies.sql -- there is no venue_id/
 * organiser_id filter in this query at all, on purpose: it's the direct
 * demonstration that "even if an API route forgets to filter" holds, since
 * this route deliberately doesn't filter.
 */
export async function listOrganiserBookings(organiserId: string): Promise<OrganiserBooking[]> {
  const { rows } = await withRls('authenticated', { organiser_id: organiserId }, (client) =>
    client.query<BookingRow>(
      `select b.id, b.show_id, s.title as show_title, b.buyer_email, b.quantity, b.tier,
              b.line_total, b.booking_fee, b.grand_total, b.confirmed_at
       from booking b
       join show s on s.id = b.show_id
       order by b.confirmed_at desc`,
    ),
  );
  return rows.map(toOrganiserBooking);
}
