export function formatMoney(minor: number, currency = 'SGD'): string {
  return new Intl.NumberFormat('en-SG', { style: 'currency', currency }).format(minor / 100);
}

/** For instants that aren't tied to a venue (e.g. when a booking was confirmed) -- UTC, explicitly labelled, never a fixed venue offset. */
export function formatUtc(instant: Date): string {
  const formatted = new Intl.DateTimeFormat('en-SG', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(instant);
  return `${formatted} UTC`;
}
