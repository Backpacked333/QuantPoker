// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { waitFor } from '@testing-library/react'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { CloudStore } from './cloud-store'
import { cacheKey, emptyCache } from './cloud-data'
import { STORAGE_KEY } from './storage'

const alice = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  email: 'a@example.com',
} as User
const bob = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  email: 'b@example.com',
} as User
const hand = (n: number) => ({
  id: `session:${n}`,
  hand: n,
  net: 40,
  result: 'Won',
  guided: false,
})
const cleanups: (() => void)[] = []
beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanups.splice(0).forEach((stop) => stop())
  vi.restoreAllMocks()
})

function harness(initialUser: User | null = alice) {
  let user = initialUser
  let listener: (
    event: string,
    session: { user: User } | null,
  ) => void = () => {}
  let fail = false
  let readGate: Promise<void> | null = null
  const upsert = vi.fn<
    (
      table: string,
      rows: unknown,
    ) => Promise<{ error: { message: string } | null }>
  >(async () => ({
    error: fail ? { message: 'offline' } : null,
  }))
  const rpc = vi.fn(async () => ({
    error: fail ? { message: 'offline' } : null,
  }))
  const reads: Record<string, unknown[]> = {}
  const client = {
    auth: {
      getSession: async () => ({
        data: { session: user ? { user } : null },
        error: null,
      }),
      onAuthStateChange: (fn: typeof listener) => {
        listener = fn
        return { data: { subscription: { unsubscribe() {} } } }
      },
      signOut: async () => {
        user = null
        listener('SIGNED_OUT', null)
        return { error: null }
      },
    },
    from: (table: string) => {
      let single = false
      let owner = ''
      const query = {
        select: () => query,
        eq: (_key: string, value: string) => {
          owner = value
          return query
        },
        order: () => query,
        limit: () => query,
        maybeSingle: () => {
          single = true
          return query
        },
        then: async (resolve: (value: unknown) => void) => {
          await readGate
          return resolve({
            data: single ? null : (reads[`${owner}:${table}`] ?? []),
            error: fail ? { message: 'offline' } : null,
          })
        },
        upsert: (rows: unknown) => upsert(table, rows),
      }
      return query
    },
    rpc,
  } as unknown as SupabaseClient
  const store = new CloudStore(client)
  cleanups.push(store.start())
  return {
    store,
    client,
    upsert,
    rpc,
    reads,
    fail: (value: boolean) => {
      fail = value
    },
    gate: (value: Promise<void> | null) => {
      readGate = value
    },
    user: (value: User | null) => {
      user = value
      listener('SIGNED_IN', value ? { user: value } : null)
    },
  }
}
async function ready(store: CloudStore, id = alice.id) {
  await waitFor(() => expect(store.snapshot().scope).toBe(id))
}

describe('private cloud outbox', () => {
  it('retains edits made while a refresh is pending even if that read fails', async () => {
    const { store, gate, fail } = harness()
    await ready(store)
    let release!: () => void
    gate(
      new Promise<void>((resolve) => {
        release = resolve
      }),
    )
    const refreshing = store.retry()
    await waitFor(() => expect(store.snapshot().status).toBe('loading'))
    store.writeProgress({ hands: [hand(4)], lessons: ['equity'] })
    fail(true)
    release()
    await refreshing
    expect(store.snapshot().cache.progress.hands).toEqual([hand(4)])
    expect(store.snapshot().cache.pending.hands).toEqual([hand(4)])
    expect(store.snapshot().status).toBe('offline')
  })
  it('recovers the remote history when the initial read failed without pending local writes', async () => {
    const { store, fail, reads } = harness()
    fail(true)
    await ready(store)
    expect(store.snapshot().status).toBe('offline')
    reads[`${alice.id}:hand_results`] = [
      {
        id: 'recovered',
        hand_number: 1,
        net: 10,
        result: 'Recovered',
        guided: false,
      },
    ]
    fail(false)
    await store.retry()
    expect(store.snapshot().status).toBe('saved')
    expect(store.snapshot().cache.progress.hands[0].id).toBe('recovered')
  })
  it('keeps guests local and does not silently import another person’s browser history', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ hands: [hand(9)], lessons: ['equity'] }),
    )
    const { store, upsert, user } = harness(null)
    store.writeProgress({ hands: [hand(1)], lessons: [] })
    await store.flush()
    expect(upsert).not.toHaveBeenCalled()
    user(alice)
    await ready(store)
    expect(store.snapshot().cache.progress.hands).toEqual([])
  })
  it('loads only the account’s remote records and ignores acknowledged stale cache', async () => {
    const cache = emptyCache()
    cache.progress.hands = [hand(100)]
    localStorage.setItem(cacheKey(alice.id), JSON.stringify(cache))
    const { store, reads } = harness()
    reads[`${alice.id}:hand_results`] = [
      { id: 'remote', hand_number: 2, net: 5, result: 'Remote', guided: true },
    ]
    await ready(store)
    expect(store.snapshot().cache.progress.hands.map((h) => h.id)).toEqual([
      'remote',
    ])
  })
  it('saves idempotent owned rows, retains failures, and retries them', async () => {
    const { store, upsert, fail } = harness()
    await ready(store)
    fail(true)
    store.writeProgress({ hands: [hand(1)], lessons: ['equity'] })
    await store.flush()
    expect(store.snapshot().status).toBe('offline')
    expect(store.snapshot().cache.pending.hands).toHaveLength(1)
    fail(false)
    await store.flush()
    expect(store.snapshot().status).toBe('saved')
    expect(store.snapshot().cache.pending.hands).toEqual([])
    expect(upsert).toHaveBeenCalledWith('hand_results', [
      expect.objectContaining({ user_id: alice.id, id: 'session:1' }),
    ])
    expect(upsert).toHaveBeenCalledWith('lesson_progress', [
      { user_id: alice.id, lens: 'equity' },
    ])
  })
  it('recovers pending writes after a reload instead of overwriting them with server data', async () => {
    const cache = emptyCache()
    cache.progress.hands = cache.pending.hands = [hand(3)]
    localStorage.setItem(cacheKey(alice.id), JSON.stringify(cache))
    const { store, upsert } = harness()
    await ready(store)
    await store.flush()
    expect(store.snapshot().cache.progress.hands).toEqual([hand(3)])
    expect(upsert).toHaveBeenCalledWith('hand_results', expect.any(Array))
  })
  it('does not lose edits made while a previous save is in flight', async () => {
    const { store, upsert } = harness()
    await ready(store)
    let release!: () => void
    upsert.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ error: null })
        }),
    )
    store.writeProgress({ hands: [hand(1)], lessons: [] })
    const flushing = store.flush()
    await waitFor(() => expect(upsert).toHaveBeenCalledOnce())
    store.writeProgress({ hands: [hand(1), hand(2)], lessons: ['insurance'] })
    release()
    await flushing
    expect(store.snapshot().cache.pending).toEqual(emptyCache().pending)
    expect(upsert).toHaveBeenCalledWith('hand_results', [
      expect.objectContaining({ id: 'session:2' }),
    ])
  })
  it('isolates account switches and removes acknowledged local account data on sign-out', async () => {
    const { store, user } = harness()
    await ready(store)
    store.writeProgress({ hands: [hand(1)], lessons: ['options'] })
    await store.flush()
    user(bob)
    await ready(store, bob.id)
    expect(store.snapshot().cache.progress.hands).toEqual([])
    await store.signOut()
    expect(store.snapshot().scope).toBe('guest')
    expect(localStorage.getItem(cacheKey(bob.id))).toBeNull()
    expect(
      JSON.parse(localStorage.getItem(cacheKey(alice.id))!).progress.hands,
    ).toHaveLength(1)
  })
  it('clears progress only after the transactional server operation succeeds', async () => {
    const { store, fail } = harness()
    await ready(store)
    store.writeProgress({ hands: [hand(1)], lessons: ['equity'] })
    await store.flush()
    fail(true)
    await expect(store.clearProgress()).rejects.toThrow('could not be cleared')
    expect(store.snapshot().cache.progress.hands).toHaveLength(1)
    fail(false)
    await store.clearProgress()
    expect(store.snapshot().cache.progress).toEqual({ hands: [], lessons: [] })
  })
  it('stores settings, teaching attempts and completed coach messages privately', async () => {
    const { store, upsert } = harness()
    await ready(store)
    store.writeSettings({ displayName: '', sound: true, fast: true })
    store.writeAttempt({
      id: crypto.randomUUID(),
      lens: 'options',
      stage: 'transfer',
      answerId: 'floor',
      correct: true,
      context: { title: 'Option', question: 'Why?', pot: 10, call: 5 },
      createdAt: new Date().toISOString(),
    })
    store.writeMessage({
      id: crypto.randomUUID(),
      role: 'assistant',
      text: 'A completed reply.',
      snapshotId: 'visible',
      label: 'Hand 1',
      createdAt: new Date().toISOString(),
    })
    await store.flush()
    expect(upsert.mock.calls.map(([table]) => table).sort()).toEqual([
      'coach_messages',
      'practice_attempts',
      'profiles',
    ])
    expect(store.snapshot().cache.pending).toEqual(emptyCache().pending)
  })
  it('survives React StrictMode’s setup-cleanup-setup sequence', async () => {
    const { store } = harness()
    cleanups.pop()!()
    cleanups.push(store.start())
    await ready(store)
    expect(store.snapshot().status).toBe('saved')
  })
})
