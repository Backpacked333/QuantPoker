# Landing page and account onboarding

Slug: `landing-and-onboarding` · Owner: PM · Aligned with the user 2026-10-10 · Scope **B** · Priority **P0** (runs alongside Phase 1; it does not replace the ladder work)

## Problem statement

Ambitious students from top schools (math, finance, physics, CS) aiming for investment banking or quant jobs land on a practice table with no pitch. They never get a quick moment that proves how sharp they are, and account creation is buried in the Online tab, so their competitive drive never turns into a sign-up.

## What exists today `[DISCOVERED 2026-10-10]`

- There is no landing page. `#table` is the default route, and first-time visitors get `WelcomeDialog` (`src/components/Dialogs.tsx:282`), then the tour and three guided hands (`src/lib/scripted.ts`).
- Accounts exist only behind `#lobby`: `src/net/AuthGate.tsx` (email link, Google or GitHub when enabled, then a public username). Rated play needs a confirmed email.
- Per-decision grading (`gradeDecision`) and curated deals (`scripted.ts`) already run client-side, so a graded challenge hand needs no server.
- There is no product analytics. `/api/stats` counts hands per day only.
- The public profile (P1-15) and OG share card (P1-16) are planned, not built.

## Target user

**Primary:** competitive, high-ego, high-ability students, mostly at elite universities (some at elite high schools), studying math, finance, physics or CS and aiming for IB or quant roles. They want to prove they're sharp and see where they rank against peers. **Secondary:** anyone curious who arrives from a shared link.

That this audience is mainly elite-school students is **the user's hypothesis**, not data. Validate it (see Risks).

## Decisions (user, 2026-10-10)

1. **Audience:** mixed, led by the student group above.
2. **Hook: "the challenge is a hand."** One real, curated hand against Atlas on the actual table, embedded in the landing page hero, with no account needed. Each decision (3–5) is graded live, and the hand ends on a score card. This keeps the fun of a hand and the payoff of a 60-second challenge, without the tedium of a quiz.
3. **School identity: an optional badge.** Sign-up stays one click. After it, an optional step to verify a school email gives a school badge, which feeds the school-vs-school leaderboard later. Never a gate.
4. **Tone: trading-desk elite.** Dark, precise, quietly confident (a Bloomberg terminal crossed with Linear or Stripe). Monospace figures, live numbers, the real animated table as the centerpiece. Short, slightly provocative copy ("Most people misprice this hand. Do you?"). No casino imagery: no gold, no chips raining, no "win big".
5. **Scope: B** (below).

## The core loop

```
Land → play 1 curated hand in the hero (graded live) → score card
     → "Save your score & get rated" → 1-click sign-up → username → optional school verification
     → first move: rated match, or "beat your score" practice
```

## Requirements

### P0: must have

| ID   | Requirement                                                                                                                                                                                                                                                                                                                                              |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L-1  | A **landing page** at the site root for **first-time visitors only**. Returning visitors (local progress or a session) go straight to the app. A visible "Skip to practice" link always works. Deep links (`#lobby`, `#play/…`, `#learn…`, `#fair-play`, `#terms`, and challenge links) bypass it.                                                       |
| L-2  | **The hero is the challenge hand.** It is playable within 5 s of first paint, on the real table component, with keyboard support and a phone layout. The entry bundle stays within its budget, so lazy-load what the hero doesn't need.                                                                                                                  |
| L-3  | **A pool of about 6 curated challenge hands,** rotated (seeded per visitor), each with 3–5 meaningful decisions and at least one spot most players get wrong. The quant lab stays off during the challenge (same rule as rated play), and the full lab opens in the review.                                                                              |
| L-4  | **Live grading:** after each decision, a short verdict (Best / Good / Inaccuracy / Mistake / Blunder) with one line of why, phrased as a challenge, not a put-down.                                                                                                                                                                                      |
| L-5  | **The score card:** accuracy (0–100), percentile, luck shown separately from skill, the costliest decision with a "see why" replay, and the CTAs **Save your score & get rated** (primary), **Challenge a friend**, **Play another**.                                                                                                                    |
| L-6  | **An honest percentile.** Anonymous challenge scores are stored (hand id, score, no personal data) and the percentile is computed against real players once a hand has at least 200 scores. Below that it is labelled "vs model players" and computed from the population model.                                                                         |
| L-7  | **One sign-up surface,** reused by the landing page and `#lobby`: Google first, then email link, and GitHub if enabled. Median from click to username set under 45 s. The challenge score carries over into the new account.                                                                                                                             |
| L-8  | **3-step onboarding after sign-up,** each step skippable except the username: (1) pick a username, with live availability; (2) **"Rep your school"**, verify a school email for a badge (see O-1); (3) **"Your first move"**: rated match (if the email is confirmed), "Beat your score" practice, or the guided curriculum.                             |
| L-9  | **Landing sections below the hero** (short, scannable): how grading works (the chess analogy); luck vs skill; ladder and rating preview (honest. If the ladder is thin, show the format, not empty tables); "Built for people going into trading" (EV, sizing, calibration); trust (play money only, provably fair deals, links to Fair play and Terms). |
| L-10 | **Funnel analytics,** first-party and privacy-respecting (no third-party trackers, no personal data in events). Events: `landing_view`, `challenge_start`, `challenge_decision`, `challenge_complete`, `signup_start`, `signup_complete`, `username_set`, `school_verify_start/complete`, `first_move_choice`, `share_click`, `challenge_link_open`.     |
| L-11 | **Accessibility and motion:** axe-clean in both themes, reduced motion respected, the landing page passes the existing frame-time check.                                                                                                                                                                                                                 |

### P1: should have (part of scope B, can land in a second PR)

| ID   | Requirement                                                                                                                                                                                                                |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L-12 | **A share card:** a generated image ("I scored 87, top 8%. Beat me.") with OG tags on the challenge link. Reuse the P1-16 OG pipeline if it lands first; otherwise build the minimal version here and let P1-16 extend it. |
| L-13 | **A "challenge a friend" link:** opens the landing page on the **same** hand. After playing, the friend sees both scores side by side, then the sign-up CTA.                                                               |
| L-14 | **School verification by a second email** (only if O-1 lands on adding an email sender).                                                                                                                                   |

### P2: nice to have (deferred)

The daily hand with streaks, school leaderboards (need P1-12 ratings and P1-14 ladder), campus referral codes, shared links opening the public profile (needs P1-15), A/B testing of the hero copy.

### P3: won't do

A separate marketing site or CMS, required school verification, casino imagery or gambling language, a waitlist gate.

## User stories

- As a first-time visitor, I can play a graded hand within 5 seconds of landing, without signing up, so I find out if this is for me before committing anything.
- As someone who just finished the hand, I see my accuracy, percentile and luck versus skill, and which decision cost me most, so I know how I stack up and what to learn.
- As a proud scorer, I can save my score and create an account in under 45 seconds, so my result counts toward a rating.
- As a student, I can verify my school email for a badge, so I represent my school on the ladder.
- As a competitive player, I can send a friend a link to the same hand, so we can settle who's sharper.
- As a returning visitor, I skip the landing page and go straight to the app.

## Acceptance criteria (for QA)

1. A fresh browser at `/` sees the landing page. The same browser after finishing any hand, or a signed-in browser, lands in the app.
2. The challenge hand is interactive within 5 s on a throttled mid-tier phone profile (Playwright), and the entry bundle stays within budget.
3. The lab is not rendered during the challenge and is available in its review.
4. The score card always shows accuracy, percentile with its label ("vs players" or "vs model players"), and luck versus skill.
5. Sign-up from the score card ends with the challenge score attached to the new account.
6. The onboarding can be finished with only a username; every other step is skippable and can be resumed later from the profile or settings.
7. Every L-10 event fires once per action, and none carries an email, name, IP or card data.
8. axe passes in light and dark; reduced motion snaps every animation.

## Success criteria

| Funnel step                                  | Target | Read at              |
| -------------------------------------------- | ------ | -------------------- |
| New visitor → starts challenge               | ≥ 60%  | 2 weeks after launch |
| Starter → finishes hand                      | ≥ 70%  | 2 weeks              |
| Finisher → creates account                   | ≥ 25%  | 2 weeks              |
| Median click → username set                  | < 45 s | 2 weeks              |
| New account plays again in the same session  | ≥ 40%  | 2 weeks              |
| New accounts that verify a school            | ≥ 30%  | 4 weeks              |
| Finishers who share or send a challenge link | ≥ 10%  | 4 weeks              |
| Return within 7 days (D7)                    | ≥ 20%  | 4 weeks              |

If the finish-to-account step is under 10% at 2 weeks, revisit the score card and CTA before adding anything new.

## Open questions for the architect

- **O-1: school verification.** Signing up with a school email (or a school Google Workspace login) can verify automatically. Verifying a _second_ email needs an email sender (for example Resend through the Worker) plus a domain-to-school list (for example the public university-domains dataset). Decide: auto-verify only in the first PR, or add the sender now? PM preference: ship auto-verify first, add the sender in the P1 PR.
- **O-2: routing.** The app uses hash routes with `#table` as the default. Decide how `/` becomes the landing page for first-time visitors without breaking existing deep links or the static `dist/` hosting.
- **O-3: anonymous score storage and analytics sink.** Use a Worker endpoint plus a Postgres table, or reuse the existing stats path? Rate-limit it with the existing address limiter.
- **O-4: carrying the score over.** Hold the pending challenge result locally and claim it on the first signed-in load.

## Risks

1. **The audience is a hypothesis.** Check it with the school-verification rate and referrer mix at 2 and 4 weeks. If students are under 30% of sign-ups, rewrite the copy for the audience we actually get.
2. **Ego backlash on a low score.** Frame mistakes against the crowd ("71% of players make this call too") and offer an immediate "Play another".
3. **Spoiled curated hands.** That's why there is a pool of about 6, rotated, and the percentile is per hand.
4. **A thin early ladder makes the competitive pitch look empty.** Preview the format and the rating, not live empty tables, until P1-14 has data.
5. **Minors.** Some of the audience is in high school. Check the Terms minimum age before any outreach to high schools. Play money only, no prizes with cash value (cross-cutting principle 1).
6. **Bundle budget.** The landing page must not pull the lab or the online client into the entry chunk (`scripts/check-bundle.mjs`).
