# Landing page redesign: cinematic 3D, explained, account-first

Date: 2026-10-10 · Slug: `landing-and-onboarding` (v2 of the landing page) · Approved by the user in chat.

## Why

The user's verdict on the shipped landing page: lackluster, not impressive, no animation or immersion. Their two additions on approval:

1. **The page must explain what QuantPoker is and how it works,** not only offer a hand.
2. **It must be built around people making accounts.**

## Decisions (user)

- **Direction:** cinematic 3D. A real-time table lit by one spotlight in a dark void, cards dealt and flipped with weight, a camera that moves.
- **Decision beats, escalating:**
  - **first decision:** Atlas's likely hands fan out above the table as a cloud of cards, the ones that beat you glowing red and the ones you beat glowing green;
  - **last decision of the hand:** a slow-motion verdict, with the camera pushing in, equity and the price rising as two glowing bars, and the grade stamping down;
  - **other decisions:** a short grade stamp and a light shift.

  Every beat is at most about 1.5 s and skips on any click or key.

- **Devices:** the same scene everywhere, with quality scaled by measured frame rate (pixel ratio, shadows, particles). It falls back to the existing 2D table when WebGL is missing or reduced motion is on.

## The page, top to bottom

1. **Account bar** (sticky, inside the landing page): the brand, "Sign in", and "Create free account". Visible on every screen of the page.
2. **Hero:**
   - the 3D scene full-bleed, with the headline over it;
   - one line saying what QuantPoker is: "A rated ladder for poker decisions: every decision graded like a chess move, luck removed, play money only";
   - the decision bar under the table.
3. **Score card** (after the hand): accuracy counts up, the percentile bar fills, the decisions drop in. The primary CTA is "Create your free account to save this score". "Challenge a friend" and "Play another" stay.
4. **How it works:** four steps, each with a small animation as it scrolls into view:
   1. Play a hand: you just did, or can, above.
   2. Every decision is graded: the EV of each option against Atlas's likely hands, with the grade bands.
   3. Luck is taken out: the result and the decision quality are shown apart.
   4. Get rated against people: rated heads-up matches, Glicko-2 rating ± deviation, the ladder.
5. **Your account:** what it gets you, with a CTA.
   - a saved score and history;
   - a public profile at `/u/name`;
   - rating and accuracy;
   - a school badge;
   - rated matches;
   - challenge links.

   Free, play money, Google or an email link, no password.

6. **Fair play and trust:** play money only, committed decks, links.
7. **Final CTA:** play the hand, or create an account.

## Engineering shape

- `src/landing/stage/`: an imperative three.js stage (no new dependency; three is already in the repo), loaded lazily from the landing chunk.
  - API: `mount(canvas)`, `show(game, {reveal})`, `rangeCloud(range)`, `verdict(grade, equity, price)`, `stamp(grade)`, `celebrate()`, `dispose()`.
  - The challenge logic (`ChallengeHand`) keeps the state and drives either the stage or the 2D `Table`.
- **Atlas's range for the cloud:** precomputed per decision node by `src/challenge/build.ts` (the top combos by weight, each marked ahead or behind) and stored in the trees. The grades are unchanged, so no `ver` bump.
- **Accessibility:** the canvas is decorative (`aria-hidden`). A live text summary carries the hole cards, board, pot and Atlas's action; the decision buttons stay HTML.
- **Bundle:** the entry chunk is unchanged; the landing chunk stays small; three loads in its own chunk.

## Success

- The PM funnel targets stand (start ≥ 60%, finish ≥ 70%, finish to account ≥ 25%).
- New: account CTA clicks from the sticky bar and the "Your account" section, counted as `signup_start`.
- Frame rate: the e2e frame-time check passes on the 3D path.

## Out of scope

Real card physics, a 3D model for Atlas, background music, WebGPU.
