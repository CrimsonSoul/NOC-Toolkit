import React, { useEffect, useRef, useState } from 'react'

/**
 * Displays the current one-time code and a progress bar indicating
 * remaining validity time.
 * @param {Object} props
 * @param {string} props.currentCode
 * @param {string} props.previousCode
 * @param {number} props.progressKey - Forces animation restart when code updates.
 * @param {number} props.intervalMs - Duration of code validity in ms.
 */
const CodeDisplay = ({ currentCode, previousCode, progressKey, intervalMs, children }) => {
  const [progress, setProgress] = useState(0)
  const timerRef = useRef()

  useEffect(() => {
    setProgress(0)

    const getNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())
    const start = getNow()

    const update = () => {
      const elapsed = getNow() - start
      const percent = Math.min(100, (elapsed / intervalMs) * 100)
      setProgress(percent)

      if (elapsed >= intervalMs) {
        clearInterval(timerRef.current)
        timerRef.current = undefined
      }
    }

    update()

    const interval = Math.max(200, Math.min(1000, intervalMs / 20))
    timerRef.current = setInterval(update, interval)

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = undefined
      }
    }
  }, [progressKey, intervalMs])

  const hasPrevious = Boolean(previousCode)

  return (
    <div className="code-display">
      <div className="code-display__row">
        <div className="code-display__meta">
          <span className="small-text text-muted">Current Code</span>
          <div className="code-display__value" aria-live="polite">
            {currentCode}
          </div>
          {hasPrevious && <span className="code-display__previous small-muted">Prev: {previousCode}</span>}
        </div>
        {children && <div className="code-display__aside">{children}</div>}
      </div>
      <div
        className="progress-container"
        role="progressbar"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={progress}
      >
        <div
          key={progressKey}
          className="progress-bar"
          style={{ '--duration': `${intervalMs}ms` }}
        />
      </div>
    </div>
  )
}

export default CodeDisplay
