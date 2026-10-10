# six-max-tables — SDE log

## P2-01 · The 6-max engine gate: crafted cases and the soak record (2026-10-10)

PR-01 in `.10x/decisions/engineering-manager/six-max-casual.md`. Only `src/engine/engine.test.ts` changes. No engine source changed. `src/engine/testing.ts` is unchanged too: the plan lists a deck builder for crafted hands, but `deckWith` and `config` already are one.

### What it adds

Four crafted cases. The first three are the ticket's acceptance tests; the fourth came from review:

- **`6-max: all-ins on three streets with odd-chip splits award in order`.** The button sits mid-table (seat 3), so clockwise order differs from seat order. Seats go all in pre-flop, on the flop and on the turn, and four tied straights split every pot:
  - pots 515 / 800 / 1203, last side pot paid first;
  - odd chips go to the earliest winners clockwise from the seat after the button: 602/601, 267/267/266 and 129/129/129/128.
- **`folded dead money stays in the pot it entered`.** Three seats fold after putting chips in: the small blind pre-flop (10), the big blind on the flop (250) and the button on the river (700).
  - The pots go 385/700, then 385/1150, then 385/1150/600.
  - A fold mid-street removes eligibility at once and never moves chips.
- **`a short stack all-in below the big blind`.** UTG calls all in for 13. The bet to match stays 20, the minimum raise stays 40 and the big blind keeps its option.
  - The pots go 62/21, then 62/101.
  - Folded round to the big blind, the board runs out at once and the big blind's 7 above the short stack comes back (pot 36).
- **`calling all in for less than the bet does not reopen the betting`.** UTG calls 20, a 13-chip stack calls all in, and the button raises all in to 35, which is short of a full raise. UTG, who has acted, may only call or fold; the big blind, who has not, may raise to 55. Pots 62/66.

Every expected value is worked out by hand: pots, awards, stacks and nets. Each final pot list is also checked against `referencePots`, and each case ends with `assertInvariants`.

The soak now prints one line per table size with the showdown and side-pot share. The line comes after the coverage checks, so it appears only for a size that passed.

### Soak: seed 20261010, 100,000 hands per table size

`ENGINE_SEED=20261010 ENGINE_SOAK=1 npx vitest run src/engine/engine.test.ts --reporter=default` printed `engine soak: seed 20261010, 100,000 hands per table size`, then:

| Players | Hands   | Failures | Showdown | Side pot | Time    |
| ------- | ------- | -------- | -------- | -------- | ------- |
| 2       | 100,000 | 0        | 42.1%    | 0.0%     | 28.3 s  |
| 3       | 100,000 | 0        | 76.5%    | 45.6%    | 45.5 s  |
| 4       | 100,000 | 0        | 91.9%    | 77.2%    | 58.2 s  |
| 5       | 100,000 | 0        | 97.3%    | 91.3%    | 79.0 s  |
| 6       | 100,000 | 0        | 99.2%    | 97.0%    | 103.4 s |

- **Repeatability.** Three runs printed the same shares: the implementer's, the reviewer's and the run after the review fixes. The times are the reviewer's run (315 s for the file).
- **The ticket's riskiest assumption** was thin reference coverage, with more than 1% of hands for N > 2 needing a side pot. The share is 45.6% at 3 players and 97.0% at 6, so the side-pot assertion at `engine.test.ts:159` is far from its limit.
- **Heads-up never has a side pot**, because the unmatched part of a bet is refunded. The 0.0% at 2 players is expected.
- **CI:** the `soak` job passed on PR #34: https://github.com/Backpacked333/QuantPoker/actions/runs/38046218219/job/114196180046.
- **Use `--reporter=default` locally.** Vitest 4.1 switches to its agent reporter when it sees the agent environment variables, and that reporter hides `console.log`. CI's default reporter shows the lines.

### Red first

The engine was already correct, so each case was shown failing against a deliberately broken engine. Each break was made in a throwaway copy with only the crafted cases running, then thrown away. Line numbers are at `917f93b`.

| Break                                                        | Where                     | Crafted cases that failed (new ones in bold)                          |
| ------------------------------------------------------------ | ------------------------- | --------------------------------------------------------------------- |
| Odd-chip walk reversed: `rank(b) - rank(a)`                  | `hand.ts:220`             | **odd-chip splits**; the existing odd-chip test                       |
| Tied winners sorted by seat number, ignoring the button      | `hand.ts:220`             | **odd-chip splits**; the existing odd-chip test                       |
| Every odd chip to the first winner                           | `hand.ts:227`             | **odd-chip splits** only                                              |
| Folded chips left out of the pot levels (`players` → `live`) | `pots.ts:17`              | **folded dead money**, **short stack all-in**; two existing pot tests |
| A mid-street fold keeps the player eligible                  | `hand.ts:324-325` removed | **folded dead money** only                                            |
| A call not capped at the stack                               | `hand.ts:250`             | **short stack all-in**; two existing short-stack tests                |
| A short all-in call counted as a raise                       | `hand.ts:326`             | **does not reopen the betting** only                                  |

The review broke the engine nine more ways. Among them: the big blind's option, the refund of uncalled chips, and a short stack allowed to raise. At least one crafted case caught each break.

## P2-02a · Explicit blind seats and the dead button in the engine (2026-10-10)

PR-04. `HandConfig` takes optional `sb` (a seat or `null`) and `bb`. With them, the button may be a seat with no player, a dead small blind posts nothing, and `validateConfig` refuses every placement the ADR lists. Review added one more refusal: with three or more players, the button may not sit between a live small blind and the big blind, or less than two seats before the big blind when the small blind is dead. `positionNames` takes the blinds too. Configs without `sb`/`bb` archive byte-identically, which a hand-written JSON test pins.

The random walk now deals every 10th hand with explicit blinds, placed from the ADR's geometry rather than the engine's. That shifts the seeded stream, so the P2-01 soak was re-run on this branch with `ENGINE_SEED=20261010 ENGINE_SOAK=1`:

| Players | Hands   | Failures | Showdown | Side pot |
| ------- | ------- | -------- | -------- | -------- |
| 2       | 100,000 | 0        | 42.0%    | 0.0%     |
| 3       | 100,000 | 0        | 76.7%    | 45.8%    |
| 4       | 100,000 | 0        | 91.8%    | 77.1%    |
| 5       | 100,000 | 0        | 97.4%    | 91.4%    |
| 6       | 100,000 | 0        | 99.2%    | 97.0%    |
