import React, { useState } from 'react'

/**
 * Embeds the Dispatcher Radar page and provides a fallback if it fails to load.
 */
const DispatcherRadar = () => {
  const [error, setError] = useState(false)

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
            onError={() => setError(true)}
          />
          <div className="radar-frame-overlay" aria-hidden="true" />
        </div>
      )}
    </div>
  )
}

export default DispatcherRadar
