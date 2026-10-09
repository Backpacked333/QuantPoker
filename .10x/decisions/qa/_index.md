# QA — index

Last updated: 2026-10-08

## Active features

| Slug                   | Description                                                   | Status                                                                                                    |
| ---------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `multiplayer-platform` | Phase 0 gap review, Steps 1–4 (engine, accounts, table, live) | Reviewed; 27 tests added; 1 bug found and fixed (rejoin presence); release-ready for the invite-link beta |

## Cross-cutting QA principles

- **Risk order: who sits down, then who sees what, then whose chips.** Auth, redaction and chip conservation get tests before UI polish.
- **Auth is tested with real tokens.** Dev tokens prove the table logic; a signed ES256 token against a stubbed JWKS proves the gate. Every check in `verifyToken` has a test that fails when the check is removed (mutation-checked).
- **Hand-compute crafted engine cases.** Write the expected pots, stacks and nets from the rules before running; never paste the engine's output into the assertion.
- **Presence is state.** Test what the _other_ player sees when someone leaves and returns, not just that the returner gets a welcome.
- **No sleeps in tests.** Worker tests poll for frames (`client.next`) and drive alarms with `runDurableObjectAlarm`; UI reconnect tests use fake timers only around the backoff.
