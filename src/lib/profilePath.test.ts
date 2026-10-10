import { afterEach, describe, expect, it } from 'vitest'
import { profilePathToHash } from './profilePath'

const at = (path: string) => {
  window.history.replaceState(null, '', path)
  return window.location
}

afterEach(() => window.history.replaceState(null, '', '/'))

describe('a shared profile path', () => {
  it('opens the profile route at the site root', () => {
    profilePathToHash(at('/u/alice_92'))
    expect(window.location.pathname).toBe('/')
    expect(window.location.hash).toBe('#u/alice_92')
  })

  it('opens a shared challenge score at the site root', () => {
    const receipt = 'ab'.repeat(16)
    profilePathToHash(at(`/c/${receipt}`))
    expect(window.location.pathname).toBe('/')
    expect(window.location.hash).toBe(`#c/${receipt}`)
  })

  it('leaves every other path alone, including names no account can have', () => {
    for (const path of [
      '/',
      '/u/',
      '/u/AB',
      '/u/a',
      '/u/alice/extra',
      '/x/alice',
      '/c/abc',
      '/c/' + 'AB'.repeat(16),
    ]) {
      profilePathToHash(at(path))
      expect(window.location.pathname + window.location.hash).toBe(path)
    }
  })
})
