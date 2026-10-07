import type { SupabaseClient, User } from '@supabase/supabase-js'
import type { Progress } from './storage'
import {
  acknowledge,
  cacheKey,
  cacheSchema,
  emptyCache,
  mergeProgress,
  messageSchema,
} from './cloud-data'
import type {
  CloudCache,
  PracticeAttempt,
  SavedMessage,
  Settings,
} from './cloud-data'

export type CloudState = {
  user: User | null
  scope: string
  cache: CloudCache
  status: 'guest' | 'loading' | 'saving' | 'saved' | 'offline'
  localAvailable: boolean
}

export class CloudStore {
  private state: CloudState = {
    user: null,
    scope: 'guest',
    cache: emptyCache(),
    status: 'guest',
    localAvailable: true,
  }
  private listeners = new Set<() => void>()
  private generation = 0
  private flushing: Promise<void> | null = null
  private timer: ReturnType<typeof setTimeout> | undefined
  constructor(readonly client: SupabaseClient | null) {}
  snapshot = () => this.state
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  private publish(update: Partial<CloudState>) {
    this.state = { ...this.state, ...update }
    this.listeners.forEach((listener) => listener())
  }
  private persist(cache: CloudCache) {
    let localAvailable = true
    try {
      localStorage.setItem(cacheKey(this.state.user!.id), JSON.stringify(cache))
    } catch {
      localAvailable = false
    }
    this.publish({ cache, localAvailable })
  }
  private cached(userId: string): CloudCache {
    try {
      return cacheSchema.parse(
        JSON.parse(localStorage.getItem(cacheKey(userId)) ?? 'null'),
      )
    } catch {
      return emptyCache()
    }
  }
  start() {
    if (!this.client) return () => {}
    const client = this.client
    let active = true
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      // Do not await Supabase requests inside its auth lock.
      setTimeout(() => {
        if (active) void this.loadUser(session?.user ?? null)
      }, 0)
    })
    void client.auth.getSession().then(({ data, error }) => {
      if (active && !error) void this.loadUser(data.session?.user ?? null)
    })
    const retry = () => {
      void this.retry()
    }
    window.addEventListener('online', retry)
    return () => {
      active = false
      this.generation++
      this.loadingUser = null
      clearTimeout(this.timer)
      subscription.unsubscribe()
      window.removeEventListener('online', retry)
    }
  }
  private loadingUser: string | null | undefined
  private async loadUser(user: User | null, force = false) {
    if (
      this.loadingUser === user?.id ||
      (!force && user && this.state.user?.id === user.id)
    )
      return
    this.loadingUser = user?.id
    const generation = ++this.generation
    clearTimeout(this.timer)
    if (!user || !this.client) {
      this.loadingUser = null
      this.publish({
        user: null,
        scope: 'guest',
        cache: emptyCache(),
        status: 'guest',
      })
      return
    }
    this.publish(
      this.state.user?.id === user.id
        ? { status: 'loading' }
        : {
            user: null,
            scope: `loading:${user.id}`,
            cache: emptyCache(),
            status: 'loading',
          },
    )
    let cache = this.cached(user.id)
    let status: CloudState['status'] = 'saved'
    try {
      const [hands, lessons, profile, messages] = await Promise.all([
        this.client
          .from('hand_results')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(100),
        this.client
          .from('lesson_progress')
          .select('lens')
          .eq('user_id', user.id),
        this.client
          .from('profiles')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle(),
        this.client
          .from('coach_messages')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(40),
      ])
      if ([hands, lessons, profile, messages].some((result) => result.error))
        throw new Error('Cloud unavailable')
      cache =
        this.state.user?.id === user.id
          ? this.state.cache
          : this.cached(user.id)
      const progress = {
        hands: (hands.data ?? []).reverse().map((h) => ({
          id: h.id,
          hand: h.hand_number,
          net: h.net,
          result: h.result,
          guided: h.guided,
        })),
        lessons: (lessons.data ?? []).map((l) => l.lens),
      }
      const restored = (messages.data ?? []).reverse().map((m) => ({
        id: m.id,
        role: m.role,
        text: m.text,
        snapshotId: m.snapshot_id,
        label: m.label,
        createdAt: new Date(m.created_at).toISOString(),
      }))
      cache = cacheSchema.parse({
        ...cache,
        progress: mergeProgress(progress, cache.pending),
        settings:
          cache.pending.settings ??
          (profile.data
            ? {
                displayName: profile.data.display_name,
                sound: profile.data.sound,
                fast: profile.data.fast,
              }
            : emptyCache().settings),
        messages: [
          ...new Map(
            [...restored, ...cache.pending.messages].map((m) => [m.id, m]),
          ).values(),
        ].slice(-40),
      })
    } catch {
      status = 'offline'
      cache =
        this.state.user?.id === user.id
          ? this.state.cache
          : this.cached(user.id)
    }
    if (generation !== this.generation) return
    this.loadingUser = null
    this.publish({ user, scope: user.id, status, cache })
    this.persist(cache)
    if (status !== 'offline') void this.flush()
  }
  private changed(cache: CloudCache) {
    this.persist(cache)
    this.publish({ status: 'saving' })
    clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      void this.flush()
    }, 400)
  }
  writeProgress = (progress: Progress) => {
    if (!this.state.user) return
    const cache = this.state.cache
    if (JSON.stringify(progress) === JSON.stringify(cache.progress)) return
    const newHands = progress.hands.filter(
      (h) => !cache.progress.hands.some((old) => old.id === h.id),
    )
    this.changed({
      ...cache,
      progress,
      pending: {
        ...cache.pending,
        hands: [
          ...new Map(
            [...cache.pending.hands, ...newHands].map((h) => [h.id, h]),
          ).values(),
        ],
        lessons: [
          ...new Set([
            ...cache.pending.lessons,
            ...progress.lessons.filter(
              (l) => !cache.progress.lessons.includes(l),
            ),
          ]),
        ],
      },
    })
  }
  writeSettings = (settings: Settings) => {
    if (
      !this.state.user ||
      JSON.stringify(settings) === JSON.stringify(this.state.cache.settings)
    )
      return
    this.changed({
      ...this.state.cache,
      settings,
      pending: { ...this.state.cache.pending, settings },
    })
  }
  writeAttempt = (attempt: PracticeAttempt) => {
    if (!this.state.user) return
    const cache = this.state.cache
    this.changed({
      ...cache,
      pending: {
        ...cache.pending,
        attempts: [...cache.pending.attempts, attempt],
      },
    })
  }
  writeMessage = (message: SavedMessage) => {
    if (!this.state.user) return
    const result = messageSchema.safeParse(message)
    if (!result.success) return
    const cache = this.state.cache
    this.changed({
      ...cache,
      messages: [
        ...cache.messages.filter((m) => m.id !== message.id),
        message,
      ].slice(-40),
      pending: {
        ...cache.pending,
        messages: [
          ...cache.pending.messages.filter((m) => m.id !== message.id),
          message,
        ],
      },
    })
  }
  flush = async (): Promise<void> => {
    if (this.loadingUser) return
    if (this.flushing) {
      await this.flushing
      return this.flush()
    }
    const user = this.state.user
    const client = this.client
    if (!user || !client) return
    const generation = this.generation
    const sent = this.state.cache.pending
    if (
      !sent.hands.length &&
      !sent.lessons.length &&
      !sent.attempts.length &&
      !sent.messages.length &&
      !sent.settings
    )
      return
    this.publish({ status: 'saving' })
    this.flushing = (async () => {
      try {
        const { data } = await client.auth.getSession()
        if (data.session?.user.id !== user.id)
          throw new Error('Account changed')
        const requests = []
        if (sent.hands.length)
          requests.push(
            client.from('hand_results').upsert(
              sent.hands.map((h) => ({
                user_id: user.id,
                id: h.id,
                hand_number: h.hand,
                net: h.net,
                result: h.result,
                guided: h.guided,
              })),
              { onConflict: 'user_id,id', ignoreDuplicates: true },
            ),
          )
        if (sent.lessons.length)
          requests.push(
            client.from('lesson_progress').upsert(
              sent.lessons.map((lens) => ({ user_id: user.id, lens })),
              { onConflict: 'user_id,lens', ignoreDuplicates: true },
            ),
          )
        if (sent.attempts.length)
          requests.push(
            client.from('practice_attempts').upsert(
              sent.attempts.map((a) => ({
                user_id: user.id,
                id: a.id,
                lens: a.lens,
                stage: a.stage,
                answer_id: a.answerId,
                correct: a.correct,
                context: a.context,
                created_at: a.createdAt,
              })),
              { onConflict: 'user_id,id', ignoreDuplicates: true },
            ),
          )
        if (sent.messages.length)
          requests.push(
            client.from('coach_messages').upsert(
              sent.messages.map((m) => ({
                user_id: user.id,
                id: m.id,
                role: m.role,
                text: m.text,
                snapshot_id: m.snapshotId,
                label: m.label,
                created_at: m.createdAt,
              })),
              { onConflict: 'user_id,id' },
            ),
          )
        if (sent.settings)
          requests.push(
            client.from('profiles').upsert({
              user_id: user.id,
              display_name: sent.settings.displayName,
              sound: sent.settings.sound,
              fast: sent.settings.fast,
              updated_at: new Date().toISOString(),
            }),
          )
        const results = await Promise.all(requests)
        if (results.some((result) => result.error))
          throw new Error('Sync failed')
        if (generation !== this.generation) return
        this.persist({
          ...this.state.cache,
          pending: acknowledge(this.state.cache.pending, sent),
        })
        this.publish({ status: 'saved' })
      } catch {
        if (generation === this.generation) this.publish({ status: 'offline' })
      }
    })()
    await this.flushing
    this.flushing = null
    if (
      this.state.status === 'saved' &&
      JSON.stringify(this.state.cache.pending) !==
        JSON.stringify(emptyCache().pending)
    )
      await this.flush()
  }
  clearProgress = async () => {
    if (this.loadingUser)
      throw new Error('Wait for account loading to finish, then retry.')
    await this.flush()
    if (!this.client || !this.state.user || this.state.status === 'offline')
      throw new Error('Connect to clear cloud progress. Nothing was deleted.')
    const generation = this.generation
    const { error } = await this.client.rpc('clear_learning_progress')
    if (error || generation !== this.generation)
      throw new Error('Progress could not be cleared. Please retry.')
    this.persist({
      ...this.state.cache,
      progress: { hands: [], lessons: [] },
      pending: {
        ...this.state.cache.pending,
        hands: [],
        lessons: [],
        attempts: [],
      },
    })
  }
  retry = async () => {
    await this.flush()
    if (this.state.user) await this.loadUser(this.state.user, true)
  }
  signOut = async () => {
    await this.flush()
    if (this.state.status === 'offline')
      throw new Error(
        'Unsynced changes remain on this device. Reconnect and retry before signing out.',
      )
    const id = this.state.user?.id
    const { error } = await this.client!.auth.signOut({ scope: 'local' })
    if (error) throw error
    if (id) {
      try {
        localStorage.removeItem(cacheKey(id))
      } catch {
        /* Storage may be disabled. */
      }
    }
    await this.loadUser(null)
  }
}
