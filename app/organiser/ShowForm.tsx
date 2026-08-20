import type { OrganiserVenue } from '../../lib/db/venues';

export interface ShowFormDefaults {
  venueId?: string;
  title?: string;
  blurb?: string | null;
  startsAtLocal?: string;
  durationMins?: number;
  capacity?: number;
  basePriceMinor?: number;
  currency?: string;
  status?: string;
}

export function ShowForm({
  venues,
  defaults,
  action,
  submitLabel,
}: {
  venues: OrganiserVenue[];
  defaults?: ShowFormDefaults;
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
}) {
  return (
    <form action={action} className="mt-6 flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-sm opacity-70">Venue</span>
        <select
          name="venueId"
          defaultValue={defaults?.venueId}
          required
          className="rounded-lg border border-white/15 bg-transparent p-2"
        >
          {venues.map((venue) => (
            <option key={venue.id} value={venue.id} className="bg-black">
              {venue.name} ({venue.city})
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm opacity-70">Title</span>
        <input
          name="title"
          defaultValue={defaults?.title}
          required
          className="rounded-lg border border-white/15 bg-transparent p-2"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm opacity-70">Blurb</span>
        <textarea
          name="blurb"
          defaultValue={defaults?.blurb ?? ''}
          className="rounded-lg border border-white/15 bg-transparent p-2"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm opacity-70">Starts at (venue-local time)</span>
        <input
          type="datetime-local"
          name="startsAtLocal"
          defaultValue={defaults?.startsAtLocal}
          required
          className="rounded-lg border border-white/15 bg-transparent p-2"
        />
      </label>

      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm opacity-70">Duration (mins)</span>
          <input
            type="number"
            name="durationMins"
            defaultValue={defaults?.durationMins}
            min={1}
            required
            className="rounded-lg border border-white/15 bg-transparent p-2"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm opacity-70">Capacity</span>
          <input
            type="number"
            name="capacity"
            defaultValue={defaults?.capacity}
            min={0}
            required
            className="rounded-lg border border-white/15 bg-transparent p-2"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm opacity-70">Base price (minor units, e.g. cents)</span>
          <input
            type="number"
            name="basePriceMinor"
            defaultValue={defaults?.basePriceMinor}
            min={0}
            required
            className="rounded-lg border border-white/15 bg-transparent p-2"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm opacity-70">Currency</span>
          <input
            name="currency"
            defaultValue={defaults?.currency ?? 'SGD'}
            required
            className="rounded-lg border border-white/15 bg-transparent p-2"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-sm opacity-70">Status</span>
        <select
          name="status"
          defaultValue={defaults?.status ?? 'draft'}
          className="rounded-lg border border-white/15 bg-transparent p-2"
        >
          <option value="draft" className="bg-black">
            Draft
          </option>
          <option value="on_sale" className="bg-black">
            On sale
          </option>
          <option value="cancelled" className="bg-black">
            Cancelled
          </option>
        </select>
      </label>

      <button type="submit" className="mt-2 rounded-lg bg-white/10 px-4 py-2">
        {submitLabel}
      </button>
    </form>
  );
}
