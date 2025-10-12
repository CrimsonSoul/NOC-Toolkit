import React, { useState, useEffect, memo, useMemo, useCallback } from 'react'
import { toast } from 'react-hot-toast'

const DEFAULT_RADAR_URL = 'https://cw-intra-web/CWDashboard/Home/Radar'

const sanitizeRadarUrl = (rawUrl) => {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return DEFAULT_RADAR_URL
  }

  const trimmed = rawUrl.trim()

  if (!trimmed) {
    return DEFAULT_RADAR_URL
  }

  try {
    // If the URL is missing a protocol, assume https to match the default.
    const parsed = trimmed.match(/^https?:\/\//i)
      ? new URL(trimmed)
      : new URL(`https://${trimmed}`)

    return parsed.toString()
  } catch (error) {
    console.warn('Invalid radar URL provided, falling back to default:', error)
    return DEFAULT_RADAR_URL
  }
}

/**
 * Embeds the Dispatcher Radar page and provides a fallback if it fails to load.
 */
const DispatcherRadar = () => {
  const [error, setError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  const radarUrl = useMemo(() => {
    return sanitizeRadarUrl(import.meta.env.VITE_RADAR_URL)
  }, [])

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

  const openRadarExternally = useCallback(() => {
    if (window.nocListAPI?.openExternal) {
      window.nocListAPI.openExternal(radarUrl)
    } else {
      window.open(radarUrl, '_blank', 'noopener,noreferrer')
    }
  }, [radarUrl])

  return (
    <div className="radar-container">
      {error ? (
        <div className="radar-fallback text-center">
          <p className="mb-1">Unable to load Dispatcher Radar.</p>
          <div className="radar-fallback__actions">
            <button
              type="button"
              className="btn btn-accent"
              onClick={() => {
                setError(false)
                setReloadKey((prev) => prev + 1)
              }}
            >
              Try Again
            </button>
            <button type="button" className="btn btn-secondary" onClick={openRadarExternally}>
              Open in Browser
            </button>
          </div>
        </div>
      ) : (
        <div className="radar-frame-wrapper minimal-scrollbar">
          <iframe
            src={radarUrl}
            title="Dispatcher Radar"
            className="radar-frame minimal-scrollbar"
            key={reloadKey}
            onError={() => setError(true)}
            onLoad={() => setError(false)}
            allow="clipboard-read; clipboard-write; fullscreen"
          />
        </div>
      )}
    </div>
  )
}

export default memo(DispatcherRadar)
