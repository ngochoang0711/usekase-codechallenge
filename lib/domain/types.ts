export type Tier = 'full' | 'concession' | 'under26';

export type ShowStatus = 'draft' | 'on_sale' | 'cancelled';

export interface Venue {
  id: string;
  organiserId: string;
  name: string;
  city: string;
  /** IANA zone name, e.g. "Asia/Singapore". Show times always render through this. */
  timezone: string;
}

export interface Show {
  id: string;
  venueId: string;
  title: string;
  blurb: string | null;
  /** Absolute instant -- never interpret this in any timezone but the venue's. */
  startsAt: Date;
  durationMins: number;
  capacity: number;
  basePriceMinor: number;
  currency: string;
  status: ShowStatus;
}

export interface HoldRecord {
  id: string;
  showId: string;
  sessionRef: string;
  quantity: number;
  tier: Tier;
  expiresAt: Date;
  releasedAt: Date | null;
}
