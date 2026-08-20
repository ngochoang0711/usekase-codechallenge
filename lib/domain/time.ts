// Every show instant is stored as an absolute UTC timestamptz. This module
// is the only place that converts an instant to or from a venue's local
// wall-clock time, and it always asks the real IANA timezone database (via
// Intl, built into Node/the browser) for the offset *at that specific
// instant* -- never a cached or precomputed offset. A fixed offset is
// exactly the FRG-121 bug: Melbourne is +10 most of the year and +11 under
// daylight saving, and a show near the October DST boundary needs the
// right one for its own date, not "whatever Melbourne usually is".

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number; // 0-23
  minute: number;
  second: number;
}

function getZonedParts(instant: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);

  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((p) => p.type === type);
    if (!part) throw new Error(`Intl did not return a "${type}" part for timezone ${timeZone}`);
    return Number(part.value);
  };

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    // h23 can still format midnight as "24" in some ICU builds.
    hour: get('hour') % 24,
    minute: get('minute'),
    second: get('second'),
  };
}

/** The UTC offset of `timeZone`, in minutes, at the given instant (e.g. Melbourne: 600 or 660). */
function getOffsetMinutes(instant: Date, timeZone: string): number {
  const zoned = getZonedParts(instant, timeZone);
  const asIfUtc = Date.UTC(zoned.year, zoned.month - 1, zoned.day, zoned.hour, zoned.minute, zoned.second);
  return Math.round((asIfUtc - instant.getTime()) / 60_000);
}

export interface LocalDateTime {
  year: number;
  month: number; // 1-12
  day: number;
  hour?: number;
  minute?: number;
  second?: number;
}

/**
 * Resolves a local wall-clock date/time in `timeZone` to the absolute
 * instant it refers to. Iterates twice: the offset can itself change
 * between the naive guess and the corrected instant if the wall-clock time
 * falls right around a DST transition, so one correction pass is not
 * always enough on its own, but two always converges for real IANA zones.
 */
export function zonedTimeToUtc(local: LocalDateTime, timeZone: string): Date {
  const { year, month, day, hour = 0, minute = 0, second = 0 } = local;
  let guess = Date.UTC(year, month - 1, day, hour, minute, second);

  for (let i = 0; i < 2; i++) {
    const offsetMinutes = getOffsetMinutes(new Date(guess), timeZone);
    guess = Date.UTC(year, month - 1, day, hour, minute, second) - offsetMinutes * 60_000;
  }

  return new Date(guess);
}

/** The [start, end) UTC instants spanning one local calendar date in `timeZone`. */
export function localDateRangeUtc(dateStr: string, timeZone: string): { start: Date; end: Date } {
  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year || !month || !day) {
    throw new Error(`Expected an ISO date like "2026-10-04", got "${dateStr}"`);
  }

  const start = zonedTimeToUtc({ year, month, day }, timeZone);
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
  const end = zonedTimeToUtc(
    { year: nextDay.getUTCFullYear(), month: nextDay.getUTCMonth() + 1, day: nextDay.getUTCDate() },
    timeZone,
  );

  return { start, end };
}

/** For pre-filling an `<input type="datetime-local">` with an instant's venue-local wall clock, e.g. "2026-10-05T02:30". */
export function toDatetimeLocalString(instant: Date, timeZone: string): string {
  const { year, month, day, hour, minute } = getZonedParts(instant, timeZone);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}`;
}

/** Human-readable local time for display, e.g. "Sun, 4 Oct 2026, 2:30 pm". */
export function formatInVenueTimezone(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-SG', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(instant);
}
