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

  const rafRef = useRef()

  useEffect(() => {
    setProgress(0)
    let start

    const step = (timestamp) => {
      if (start === undefined) start = timestamp
      const elapsed = timestamp - start
      const percent = Math.min(100, (elapsed / intervalMs) * 100)
      setProgress(percent)
      if (elapsed < intervalMs) {
        rafRef.current = requestAnimationFrame(step)
      }
    }

    rafRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafRef.current)
  }, [progressKey, intervalMs])

  const hasPrevious = Boolean(previousCode)

  return (
    <div className="code-display">
      <div className="code-display__row">
        <div className="code-display__meta">
          <span className="small-text text-muted">Current Code</span>
          <div className="code-display__value large-bold" aria-live="polite">
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
