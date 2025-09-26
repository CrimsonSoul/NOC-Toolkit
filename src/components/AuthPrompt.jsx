import React, { useEffect, useMemo, useRef, useState, memo } from 'react'

const getHostLabel = (challenge) => {
  if (!challenge) return ''

  if (challenge.host) {
    const port =
      typeof challenge.port === 'number' && challenge.port > 0 && challenge.port !== 80 && challenge.port !== 443
        ? `:${challenge.port}`
        : ''
    return `${challenge.host}${port}`
  }

  if (challenge.url) {
    try {
      return new URL(challenge.url).host
    } catch {
      return challenge.url
    }
  }

  return ''
}

const AuthPrompt = ({ challenge, submitting, onSubmit, onCancel }) => {
  const [username, setUsername] = useState(challenge?.usernameHint || challenge?.username || '')
  const [password, setPassword] = useState('')
  const usernameRef = useRef(null)
  const passwordRef = useRef(null)

  useEffect(() => {
    setUsername(challenge?.usernameHint || challenge?.username || '')
    setPassword('')
  }, [challenge?.id, challenge?.username, challenge?.usernameHint])

  useEffect(() => {
    if (!challenge) return undefined

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancel()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [challenge, onCancel])

  useEffect(() => {
    if (!challenge) return undefined

    const focusTimer = setTimeout(() => {
      const target = usernameRef.current || passwordRef.current
      target?.focus()
      target?.select?.()
    }, 40)

    return () => clearTimeout(focusTimer)
  }, [challenge])

  const hostLabel = useMemo(() => getHostLabel(challenge), [challenge])

  const schemeLabel = challenge?.scheme ? challenge.scheme.toUpperCase() : ''

  const showFailure = (challenge?.previousFailureCount || 0) > 0

  const disableSubmit = submitting || !username.trim() || !password

  const handleSubmit = (event) => {
    event.preventDefault()
    if (disableSubmit) return

    onSubmit({ username: username.trim(), password })
  }

  return (
    <div className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
      <div className="auth-modal__backdrop" />
      <div className="auth-modal__card">
        <h2 id="auth-modal-title" className="auth-modal__title">
          Sign in to continue
        </h2>
        <p className="auth-modal__description">
          {challenge?.realm ? (
            <>
              The site <span className="auth-modal__host">{challenge.realm}</span>
              {hostLabel ? <span> ({hostLabel})</span> : null} requires your credentials.
            </>
          ) : (
            <>
              {hostLabel ? <span className="auth-modal__host">{hostLabel}</span> : 'This site'} is requesting credentials.
            </>
          )}
        </p>
        {schemeLabel ? (
          <p className="auth-modal__meta">
            Authentication type: <span>{schemeLabel}</span>
          </p>
        ) : null}
        {showFailure ? (
          <div className="auth-modal__error" role="alert">
            Sign-in failed. Double-check your username and password.
          </div>
        ) : null}
        <form className="auth-modal__form" onSubmit={handleSubmit} autoComplete="off">
          <div className="auth-modal__field">
            <label htmlFor="auth-username">Username</label>
            <input
              id="auth-username"
              ref={usernameRef}
              type="text"
              className="auth-modal__input"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              disabled={submitting}
            />
          </div>
          <div className="auth-modal__field">
            <label htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              ref={passwordRef}
              type="password"
              className="auth-modal__input"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              disabled={submitting}
            />
          </div>
          <div className="auth-modal__actions">
            <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn-accent" disabled={disableSubmit}>
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default memo(AuthPrompt)
