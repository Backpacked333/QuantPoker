// Verify a school email that is not the sign-in address (L-14): send a code
// to it, type it back. The server checks the address is a school's, keeps
// only the code's hash, and sets the badge once the code is right.
import { useState } from 'react'
import type { FormEvent } from 'react'
import { GraduationCap } from 'lucide-react'
import { track } from '../lib/track'

const START_ERRORS: Record<string, string> = {
  not_school:
    'That address is not one we recognise as a school: try a .edu, .ac.uk or your university address.',
  too_many: 'That is enough codes for today. Try again tomorrow.',
  email_unavailable:
    'School emails cannot be sent right now. You can still play; try again later.',
  unavailable: 'We could not check that school just now. Try again.',
}
const CONFIRM_ERRORS: Record<string, string> = {
  wrong: 'That code is not right. Check the email and try again.',
  locked: 'Too many wrong codes. Send a new one.',
  expired: 'That code has expired. Send a new one.',
  no_code: 'Send a code first.',
}

async function call(
  path: string,
  body: Record<string, string>,
  getToken: () => Promise<string | null>,
) {
  const token = await getToken()
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
  const json = (await response.json().catch(() => ({}))) as {
    school?: string
    error?: string
  }
  return { ok: response.ok, ...json }
}

export function SchoolEmail({
  getToken,
  onVerified,
}: {
  getToken: () => Promise<string | null>
  onVerified: (school: string) => void
}) {
  const [email, setEmail] = useState('')
  const [sentTo, setSentTo] = useState<{
    email: string
    school: string
  } | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const send = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    track('school_verify_start')
    try {
      const result = await call('/api/school/start', { email }, getToken)
      if (result.ok && result.school)
        setSentTo({ email: email.trim(), school: result.school })
      else
        setError(START_ERRORS[result.error ?? ''] ?? START_ERRORS.unavailable)
    } catch {
      setError(START_ERRORS.unavailable)
    }
    setBusy(false)
  }
  const confirm = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const result = await call('/api/school/confirm', { code }, getToken)
      if (result.ok && result.school) {
        track('school_verify_complete')
        onVerified(result.school)
      } else {
        setError(CONFIRM_ERRORS[result.error ?? ''] ?? CONFIRM_ERRORS.wrong)
        if (result.error === 'locked' || result.error === 'expired') {
          setSentTo(null)
          setCode('')
        }
      }
    } catch {
      setError('Could not check the code. Try again.')
    }
    setBusy(false)
  }

  return (
    <div className="onboard-school">
      <p className="live-muted">
        <GraduationCap size={16} /> Play for your school: verify a school email
        and your badge shows on your profile and the ladder. Your school email
        is used once and never shown.
      </p>
      {sentTo ? (
        <form className="live-email" onSubmit={(e) => void confirm(e)}>
          <label htmlFor="school-code">
            Code sent to {sentTo.email} ({sentTo.school})
          </label>
          <div className="live-row">
            <input
              id="school-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
            <button
              className="btn btn-primary"
              disabled={busy || code.length !== 6}
            >
              Verify
            </button>
          </div>
        </form>
      ) : (
        <form className="live-email" onSubmit={(e) => void send(e)}>
          <label htmlFor="school-email">School email</label>
          <div className="live-row">
            <input
              id="school-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button className="btn btn-outline" disabled={busy || !email}>
              Send code
            </button>
          </div>
        </form>
      )}
      {error && (
        <p className="live-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
