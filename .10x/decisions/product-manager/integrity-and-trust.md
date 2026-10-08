# integrity-and-trust

Status: Scoped, awaiting user alignment · Priority: **P0** for anything rated (v1 ships with the HU ladder; v2 gates rated 6-max)

## Problem statement

The moment a rating can go on a résumé, someone will cheat for it. Poker has three classic attacks (real-time assistance, collusion, multi-accounting) and a fourth specific to us: **QuantPoker ships its own solver-lite lab**. If the lab runs during a rated hand it is RTA by design. Recruiters only trust a ladder that visibly defends itself.

## Threats and responses

| Threat | What it looks like | v1 (with HU ladder) | v2 (before rated 6-max) |
| --- | --- | --- | --- |
| **Our own lab as RTA** | Player opens the lab/3D/EV during a live rated hand | Server does not send analysis data until the hand ends; lab UI hidden; equity ring and EV labels off; the `?seed` and `?motion` debug params ignored on rated tables | Same |
| **External RTA** (solver in another window) | Superhuman accuracy, uniform decision times | Decision-time telemetry per action; flag accuracy > 97th percentile with timing anomalies for review (no auto-ban) | Statistical RTA screen: accuracy distribution vs. population by stakes of decision; manual review queue |
| **Collusion** (6-max) | Two accounts always at the same table, soft-play, chip dumping | n/a (HU: nothing to collude with except win-trading, see below) | Seat co-occurrence score, hand-level soft-play detection (checked-down pots between linked accounts), chip-dump detection (large all-in losses with weak holdings to the same account); arena seating randomised within band |
| **Win-trading / sandbagging** (HU) | Two accounts queue at the same time and trade wins; or deliberately tank to farm weaker opponents | Matchmaking refuses pairing the same two accounts more than 2× per day; rating gains vs. the same opponent decay; abandon = loss | Graph analysis of match pairs |
| **Multi-accounting** | Fresh account to play low-rated opponents | Email verification + OAuth; device/IP fingerprint soft-linking; one active table per account | Phone verification required to appear on the ladder |
| **Bots playing rated** | 24/7 play, no timing variance | Rated tables are human-only; bots only fill casual; timing-variance check | Challenge (captcha-like) on anomaly, not routinely |
| **Client tampering** | Modified client sends illegal actions, reads memory | Server-authoritative; client only has its own cards; all legality server-checked; signed hand-history ids | Same |
| **Data leakage via review** | Opponent's unshown hole cards visible in a replay | Review only reveals cards shown at showdown; never ship unshown cards to any client | Same |

## Fairness guarantees we publish

- Cryptographically secure shuffle on the server; per-hand commitment hash of the shuffled deck published at hand start and the deck revealed in the hand history after the hand (lets anyone verify we did not re-deal). Cheap to build, high trust value.
- Hand histories of rated play are public and permanent (ToS).
- A published **Fair Play** page: what we detect, what we don't, how to report, what a sanction is.

## Sanctions (v1)

- Abandonment: counted; > 10% removes ladder eligibility until it falls.
- Confirmed RTA/collusion: rating reset, ladder removal, account flagged on profile ("sanctioned"). Human decision, logged; one appeal.
- No auto-bans in v1. The population is small; false positives cost more than a few cheaters.

## Recruiter-facing trust (P1)

- **Verified** badge: phone + government-free lightweight checks (OAuth from a .edu/.ac domain or GitHub with age/activity) — self-selected, shown as "verified email domain", nothing stronger claimed.
- Profile shows: sanctions history, abandonment rate, volume, RD, date range of activity, and a link to the method page.
- Public read-only API for a profile (JSON) so firms can pull it (P2).

## User stories

- As a player, I want to know the lab is off for everyone during rated play so that I know the ladder is fair.
- As a player, I want to verify a hand's deck was committed before the deal so that I trust the shuffle.
- As a player, I want to report a suspicious opponent in one click from the review so that cheating gets looked at.
- As a recruiter, I want to see that a profile has no sanctions and has verified contact so that I can take the number seriously.

## Success criteria

| Metric | Target |
| --- | --- |
| Analysis data sent to a client during a live rated hand | 0 (network test in CI) |
| Deck-commitment verification failures | 0 |
| Reports reviewed within 7 days | 100% |
| Confirmed cheating cases per 1,000 rated matches | tracked; sanctions visible |
| Ladder-eligible players with verified email domain or phone | ≥ 50% by day 90 |

## Out of scope

- KYC / government ID. Not a money product; don't collect documents.
- Automated banning, ML anti-cheat at launch.
- Screen or webcam proctoring.

## Risks

- **Over-promising detection.** The Fair Play page must say what we don't catch. Recruiters will trust honesty more than claims.
- **Decision-time telemetry is privacy-sensitive.** Store aggregated per-action timings only; disclose in the privacy policy.
- **Solo builder can't staff a review queue.** Keep reports low-volume (rated only, one per match), and review weekly.
