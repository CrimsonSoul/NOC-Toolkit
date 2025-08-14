import React, { useEffect, useState } from 'react'

/**
 * Displays the current one-time code and a progress bar indicating
 * remaining validity time.
 * @param {Object} props
 * @param {string} props.currentCode
 * @param {string} props.previousCode
 * @param {number} props.progressKey - Forces animation restart when code updates.
 * @param {number} props.intervalMs - Duration of code validity in ms.
 */
const CodeDisplay = ({ currentCode, previousCode, progressKey, intervalMs }) => {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    setProgress(0)
    const start = Date.now()
    const id = setInterval(() => {
      const elapsed = Date.now() - start
      const percent = Math.min(100, (elapsed / intervalMs) * 100)
      setProgress(percent)
      if (elapsed >= intervalMs) {
        clearInterval(id)
      }
    }, 100)
    return () => clearInterval(id)
  }, [progressKey, intervalMs])

  return (
    <div className="text-center">
      <div className="large-bold">
        Code: {currentCode}
      </div>
      <div className="small-muted">
        Prev: {previousCode || 'N/A'}
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
