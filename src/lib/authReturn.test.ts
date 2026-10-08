import { describe, expect, it } from 'vitest'
import { rememberAuthReturn, restoreAuthReturn } from './authReturn'

const at = (url: string) => {
  window.history.replaceState(null, '', url)
  return window.location
}

describe('auth return', () => {
  it('restores the remembered route when a provider comes back with a code', () => {
    rememberAuthReturn('#lobby')
    restoreAuthReturn(at('/?code=abc'))
    expect(window.location.hash).toBe('#lobby')
    expect(window.location.search).toBe('?code=abc')
    // One-shot: a later visit with a code does not jump again.
    restoreAuthReturn(at('/?code=def'))
    expect(window.location.hash).toBe('')
  })

  it('also restores after a provider error so the lobby can show it', () => {
    rememberAuthReturn('#lobby')
    restoreAuthReturn(at('/?error_description=denied'))
    expect(window.location.hash).toBe('#lobby')
  })

  it('does nothing on ordinary visits or with an unsafe target', () => {
    rememberAuthReturn('#lobby')
    restoreAuthReturn(at('/?seed=3'))
    expect(window.location.hash).toBe('')
    rememberAuthReturn('#x"><img>')
    restoreAuthReturn(at('/?code=abc'))
    expect(window.location.hash).toBe('')
  })
})
