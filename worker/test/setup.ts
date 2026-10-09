// Tests reuse the same player names, and an unfinished table from an earlier
// test would (correctly) keep them busy. Each test starts with an empty lobby.
import { env, runInDurableObject } from 'cloudflare:test'
import { beforeEach } from 'vitest'
import { lobbyStub } from '../src/lobby'
import type { LobbyDO } from '../src/lobby'

beforeEach(async () => {
  await runInDurableObject(lobbyStub(env), async (lobby: LobbyDO) => {
    const state = (lobby as unknown as { ctx: DurableObjectState }).ctx
    for (const ws of state.getWebSockets()) ws.close(1000, 'test reset')
    await state.storage.deleteAll()
  })
})
