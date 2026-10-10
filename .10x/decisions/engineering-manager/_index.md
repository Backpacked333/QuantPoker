# Staff Engineer / Engineering Manager — index

Last updated: 2026-10-10

## Active features

| Slug                   | Description                                                                                               | Status                                                                                      |
| ---------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `multiplayer-platform` | Tickets for Step 7, Phase 1 (HU ladder) and Phase 2 (6-max) in `.10x/tickets.md`                          | 49 tickets, critical path, lanes, metrics sources; 5 questions open (Q1 blocks P1-00/P1-02) |
| `six-max-casual`       | Casual 6-max: every heads-up assumption by file, 26 PRs in phases A to E, contradictions, security points | Approved by the user 2026-10-10; Phase A in progress                                        |

## Cross-cutting principles

- **Calibrate from the repo, not from memory.** Estimates use the measured Phase 0 pace (commit timestamps), with H/M/L multipliers for what that pace did not include. Re-measure after each phase.
- **The calendar is set by user gates.** Every ticket that needs a dashboard step, a secret or a go-ahead names it; the critical path counts one calendar day per gate.
- **One owner per hot file.** `worker/src/table.ts`, `record_match` and `ladder()` change in one lane, in order; everything else is planned around them.
- **A metric without a data source is a ticket.** Every PM success metric names its table, column or log line, or the ticket that creates it.
- **Read the code before ticketing a spec.** The duplicate-format finding (Q1) came from reading `dealSlots` and the live review, not from the docs.
