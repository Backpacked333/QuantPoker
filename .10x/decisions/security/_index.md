# Security Engineer — index

Last updated: 2026-10-09

## Active features

| Slug                   | Description                                       | Status                                                                                                                                 |
| ---------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `multiplayer-platform` | Phase 0 review before strangers arrive (Prompt 3) | Done 2026-10-09: 1 High, 3 Medium, 1 Low fixed; 3 Medium and 5 Low ticketed, accepted or user actions; 4 dashboard checks for the user |

## Cross-cutting principles

- **A finding is a failing test or a measured probe.** Severity follows what a normal account (or, for the commitment, the server) can actually do, not what is theoretically possible.
- **Count amplification.** One frame in, N frames out to other players, is the shape of every shared-object DoS here. Measure N before and after.
- **Verify the verifier.** A proof that checks counts instead of identities can be satisfied by repeating a valid piece. Check that every expected element is present exactly once.
- **Races live at awaits.** A Durable Object runs one event at a time only until it awaits another object; re-read state after every such await, including "is it the same caller?".
- **Fail closed on configuration.** A dev or debug switch that grants identity needs a strength check, not just a presence check.
- **Mutation-check proofs.** A test that holds must turn red when its guard is removed, or it proves nothing.
