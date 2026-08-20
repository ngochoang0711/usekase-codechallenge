# AI_USAGE.md

> Copy to `AI_USAGE.md` and fill it in **as you work**, not from memory at the
> end. Keep it short — half a page per section at most. Three honest paragraphs
> beat three pages of transcript.

## Setup

- `CLAUDE.md`: did you extend the one in this repo, replace it, or ignore it?
- Plan mode, permissions, allowed tools, MCP servers, subagents, custom commands:
  what did you turn on, and why?
- Anything you committed so the next person inherits it.

## Two or three prompts that mattered

Verbatim, with a line on what you wanted and what came back. The ones that
changed the shape of the work — or wasted twenty minutes before you rephrased.

## Where it helped with design and architecture

Where it improved a decision, versus just typing faster. Be specific about the
decision.

## Where it was confidently wrong

**Required.** One concrete case:

- What it produced
- Why it was wrong (subtly wrong is more interesting than broken)
- How you caught it — test, review, running it, reading the diff, gut feel
- What you changed, in the code and in how you prompted afterwards

If you're stuck for one, look at what it first suggested for the oversell path or
the expiry maths.

## What you rejected

Something it suggested that you decided not to do. Why.

## What you wrote yourself

Which parts you hand-wrote, and why those weren't worth delegating.

## Honest verdict

Rough split of tool-generated versus hand-written code. Where it sped you up,
where it slowed you down, what you'd do differently with another hour.
