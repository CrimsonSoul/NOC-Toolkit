import React, { useState, useEffect, memo } from 'react'
import { toast } from 'react-hot-toast'

/**
 * Embeds the Dispatcher Radar page and provides a fallback if it fails to load.
 */
const DispatcherRadar = () => {
  const [error, setError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!window.nocListAPI?.onRadarCacheCleared) return

    const unsubscribe = window.nocListAPI.onRadarCacheCleared((result = { status: 'success' }) => {
      if (result.status === 'success') {
        toast.success('Radar cache cleared. Reloading…')
        setError(false)
        setReloadKey((prev) => prev + 1)
      } else {
        const message = result.message ? `: ${result.message}` : ''
        toast.error(`Failed to refresh radar${message}`)
      }
    })

    return unsubscribe
  }, [])

  return (
    <div className="radar-container">
      {error ? (
        <div className="radar-fallback text-center">
          <p className="mb-1">Unable to load Dispatcher Radar.</p>
          <a
            href="https://cw-intra-web/CWDashboard/Home/Radar"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary"
          >
            Open Dispatcher Radar
          </a>
        </div>
      ) : (
        <div className="radar-frame-wrapper minimal-scrollbar">
          <iframe
            src="https://cw-intra-web/CWDashboard/Home/Radar"
            title="Dispatcher Radar"
            className="radar-frame minimal-scrollbar"
            key={reloadKey}
            onError={() => setError(true)}
          />
        </div>
      )}
    </div>
  )
}

export default memo(DispatcherRadar)
