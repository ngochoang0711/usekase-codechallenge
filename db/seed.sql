-- Seed data. Some of these rows are awkward on purpose. They are not mistakes.

insert into organiser (id, email, name) values
  ('0a000000-0000-0000-0000-000000000001', 'mei@blackboxsg.test',   'Mei Chen'),
  ('0a000000-0000-0000-0000-000000000002', 'darren@loftmelb.test',  'Darren Blake');

insert into venue (id, organiser_id, name, city, timezone) values
  ('0b000000-0000-0000-0000-000000000001', '0a000000-0000-0000-0000-000000000001', 'Black Box @ Bugis',   'Singapore', 'Asia/Singapore'),
  ('0b000000-0000-0000-0000-000000000002', '0a000000-0000-0000-0000-000000000001', 'The Attic',           'Singapore', 'Asia/Singapore'),
  -- observes daylight saving. This is the one that will bite you.
  ('0b000000-0000-0000-0000-000000000003', '0a000000-0000-0000-0000-000000000002', 'The Loft',            'Melbourne', 'Australia/Melbourne'),
  -- half-hour offset, no DST
  ('0b000000-0000-0000-0000-000000000004', '0a000000-0000-0000-0000-000000000002', 'Kathmandu Courtyard', 'Kathmandu', 'Asia/Kathmandu');

insert into show (id, venue_id, title, blurb, starts_at, duration_mins, capacity, base_price, status) values
  ('0c000000-0000-0000-0000-000000000001', '0b000000-0000-0000-0000-000000000001', 'Hungry Ghost Karaoke',      'One microphone, six ghosts, no encores.',        now() + interval '2 days',  75,  60, 3200, 'on_sale'),
  ('0c000000-0000-0000-0000-000000000002', '0b000000-0000-0000-0000-000000000001', 'A Very Serious Play',        'It is not a very serious play.',                 now() + interval '3 days',  60,  60, 2800, 'on_sale'),
  -- nearly gone: capacity 4, see holds and bookings below
  ('0c000000-0000-0000-0000-000000000003', '0b000000-0000-0000-0000-000000000002', 'Last Four Seats',            'Named optimistically.',                          now() + interval '1 day',   50,   4, 4500, 'on_sale'),
  -- capacity zero. Not cancelled. Decide what the UI says.
  ('0c000000-0000-0000-0000-000000000004', '0b000000-0000-0000-0000-000000000002', 'Sold Out Before It Began',   'The rehearsal sold out.',                        now() + interval '5 days',  90,   0, 5000, 'on_sale'),
  -- Melbourne, late night, near a DST boundary. Render this in venue local time.
  ('0c000000-0000-0000-0000-000000000005', '0b000000-0000-0000-0000-000000000003', 'The 2am Monologue',          'Starts at 2am local. Or does it.',              '2026-10-04 15:30:00+00', 45, 40, 2500, 'on_sale'),
  ('0c000000-0000-0000-0000-000000000006', '0b000000-0000-0000-0000-000000000003', 'Loft Improv Deathmatch',     'Two teams enter. Both apologise.',               now() + interval '6 days',  90,  55, 3000, 'on_sale'),
  -- +05:45 offset
  ('0c000000-0000-0000-0000-000000000007', '0b000000-0000-0000-0000-000000000004', 'Courtyard Shadow Puppets',   'Bring a cushion.',                               now() + interval '4 days',  60,  30, 1800, 'on_sale'),
  -- free show. Booking fee on zero is a decision, not an accident.
  ('0c000000-0000-0000-0000-000000000008', '0b000000-0000-0000-0000-000000000001', 'Free Verse, Free Entry',     'Pay what you feel, which is nothing.',           now() + interval '2 days',  40,  25,    0, 'on_sale'),
  -- expensive: 6% fee exceeds the $9.00 cap
  ('0c000000-0000-0000-0000-000000000009', '0b000000-0000-0000-0000-000000000002', 'Gala Night',                 'Includes one drink and one long speech.',        now() + interval '9 days', 120,  80, 18000, 'on_sale'),
  -- price that does not divide cleanly by three tiers
  ('0c000000-0000-0000-0000-00000000000a', '0b000000-0000-0000-0000-000000000001', 'Three For Odd Money',        'The pricing is the punchline.',                  now() + interval '7 days',  55,  33,  999, 'on_sale'),
  ('0c000000-0000-0000-0000-00000000000b', '0b000000-0000-0000-0000-000000000003', 'Draft Show, Do Not Show',    'Should never appear to the public.',             now() + interval '8 days',  60,  50, 2000, 'draft'),
  ('0c000000-0000-0000-0000-00000000000c', '0b000000-0000-0000-0000-000000000004', 'Cancelled, Sadly',           'The puppets have a scheduling conflict.',        now() + interval '3 days',  60,  30, 2200, 'cancelled'),
  ('0c000000-0000-0000-0000-00000000000d', '0b000000-0000-0000-0000-000000000002', 'Yesterday''s Matinee',       'Already happened. Should not be bookable.',      now() - interval '1 day',   60,  40, 2000, 'on_sale');

-- 'Last Four Seats': 2 confirmed, 1 live hold, 1 expired hold that nobody swept.
-- If your availability maths counts the expired one, the show looks sold out
-- when it is not. If it ignores expiry entirely, you will oversell it.
-- expires_at is timestamptz (an absolute instant), so no zone gymnastics
-- needed here -- that was only ever compensating for the naive `timestamp`
-- column this used to be. See FRG-121 in SOLUTION.md.
insert into hold (id, show_id, session_ref, quantity, tier, expires_at, released_at) values
  ('0d000000-0000-0000-0000-000000000001', '0c000000-0000-0000-0000-000000000003', 'sess-live-01',    1, 'full',       now() + interval '6 minutes', null),
  ('0d000000-0000-0000-0000-000000000002', '0c000000-0000-0000-0000-000000000003', 'sess-stale-01',   1, 'concession', now() - interval '3 minutes', null),
  -- expires exactly now: treated as already expired (create_hold/confirm_hold
  -- use `expires_at > now()` for "live", a strict inequality -- a hold at the
  -- boundary instant no longer counts). See lib/domain/availability.test.ts.
  ('0d000000-0000-0000-0000-000000000003', '0c000000-0000-0000-0000-000000000001', 'sess-boundary',   2, 'full',       now(),                        null),
  ('0d000000-0000-0000-0000-000000000004', '0c000000-0000-0000-0000-000000000009', 'sess-gala-01',    4, 'full',       now() + interval '9 minutes', null);

insert into booking (show_id, hold_id, buyer_email, quantity, tier, line_total, booking_fee, grand_total) values
  ('0c000000-0000-0000-0000-000000000003', null, 'aisha@example.test', 1, 'full',       4500,  270,  4770),
  ('0c000000-0000-0000-0000-000000000003', null, 'ben@example.test',   1, 'concession', 3150,  189,  3339),
  ('0c000000-0000-0000-0000-000000000001', null, 'cara@example.test',  2, 'full',       6400,  384,  6784),
  -- 6% of 90000 is 5400, but the cap is 900. This row is correct. Check yours.
  ('0c000000-0000-0000-0000-000000000009', null, 'dee@example.test',   5, 'full',      90000,  900, 90900);
