# Tickets

Four tickets, as they'd land in a tracker. FRG-101 is well specified. FRG-118 is
how most tickets actually arrive. FRG-121 is a bug report relayed by someone
non-technical. FRG-130 is the tool.

Work them in whatever order you think is right, and say in `SOLUTION.md` why you
picked that order.

---

## FRG-101 · Browse and book

**As** a festival-goer
**I want** to find a show and hold seats while I decide
**So that** I don't lose them to someone slower than me typing their card in.

Acceptance criteria:

- Shows listed 10 per page with a total count
- Filter by city and by availability, sort by start time
- Card shows title, venue, **start time in the venue's local timezone**, price
  from, seats left
- Draft, cancelled and past shows never appear to the public
- Loading, error and empty states all reachable and all distinct
- Hold N tickets, see a countdown, confirm into a booking, or let it lapse and
  see inventory come back
- Under concurrent confirms, the show cannot oversell. Prove it with a test that
  actually runs the writes in parallel.

---

## FRG-118 · "Can we stop people hogging seats?"

From the festival director, in Slack, verbatim:

> people are grabbing tickets and just sitting on them, the popular shows look
> sold out for ages and then seats come back. can we do something about that?
> also someone opened like 8 tabs on the same show

That's the whole ticket.

Turn it into scoped work with your own acceptance criteria before writing any
code, and put those criteria in `SOLUTION.md`. We read the criteria at least as
closely as the implementation. If you think the right answer is to build less
than what's implied, say so and say why.

---

## FRG-121 · Countdown is wrong for some people

Support relayed this:

> A customer in Melbourne says their basket timer said 4 minutes but the seats
> were released straight away. Another one said a show listed as 2am was
> actually on at 1am. Our Singapore testers can't reproduce either. Someone
> mentioned it started around the time the clocks changed.

Reproduce it, write the failing test first, then fix it. There's more than one
thing going on here.

---

## FRG-130 · Concierge bot has nothing to call

The festival wants a bot that answers "what's on tonight under $30 near Bugis?".
You don't need a chat UI, just the tool.

- `find_available_shows`, input validated with Zod:
  `{ city?: string, onDate?: string, maxPriceMinor?: number, minSeats?: number }`
- Typed output, not `any`
- Returns only genuinely bookable shows, using the **same** availability function
  as the UI. A second copy of the logic that drifts is the failure mode we're
  looking for here.
- Unit tested by calling the function directly. No LLM, no API key.

Add a line to `SOLUTION.md` on what `onDate` means when shows span four
timezones.
