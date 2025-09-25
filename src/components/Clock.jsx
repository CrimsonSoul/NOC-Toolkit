import React, { useEffect, useState } from 'react'

/**
 * Displays the current time and date without relying on any external APIs.
 */
const Clock = ({ nowProvider = () => new Date(), refreshInterval = 1000 }) => {
  const [now, setNow] = useState(() => nowProvider())

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(nowProvider())
    }, refreshInterval)

    return () => {
      clearInterval(timer)
    }
  }, [nowProvider, refreshInterval])

  return (
    <div className="clock" role="presentation">
      <div className="clock__time large-bold" aria-live="polite">
        {now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
      </div>
      <div className="clock__date small-text">{now.toLocaleDateString()}</div>
    </div>
  )
}

export default Clock
