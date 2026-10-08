// Bindings from wrangler.jsonc plus values that only exist in some places:
// DEV_AUTH_SECRET is set for local development and tests, never in
// production, and turns on `dev.<userId>.<secret>` tokens.
export type WorkerEnv = Env & { DEV_AUTH_SECRET?: string }
