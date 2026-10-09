# DevOps — index

Last updated: 2026-10-09

## Active features

| Slug                   | Description                                                    | Status                                                                                  |
| ---------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `multiplayer-platform` | Post-cleanup deploy verification; ADR day-5 auth check (§Auth) | Steps 1–3 verified; token header and archive/RLS proof wait on the user's real sign-ins |

## Cross-cutting principles

- **Prove production by artifact, not by setting.** Vite file names are content hashes: byte-compare `dist/assets` with what the live site serves. A dashboard setting we cannot read is reported as unread, never as passing.
- **Read-only against production.** Supabase checks run as `select`s or inside `begin read only … rollback`; nothing goes through `apply_migration` in a verification task.
- **RLS is proven with role-scoped queries** (`set local role authenticated` plus `request.jwt.claims`), not by reading the policy.
