import React, { useEffect, useState, useCallback, useMemo, useRef, useLayoutEffect } from 'react'
import EmailGroups from './components/EmailGroups'
import ContactSearch from './components/ContactSearch'
import CodeDisplay from './components/CodeDisplay'
import TabSelector from './components/TabSelector'
import WeatherClock from './components/WeatherClock'
import DispatcherRadar from './components/DispatcherRadar'
import { Toaster, toast } from 'react-hot-toast'
import useRotatingCode from './hooks/useRotatingCode'

function App() {
  const [selectedGroups, setSelectedGroups] = useState([])
  const [adhocEmails, setAdhocEmails] = useState([])
  const [emailData, setEmailData] = useState([])
  const [contactData, setContactData] = useState([])
  const [lastRefresh, setLastRefresh] = useState('N/A')
  const [tab, setTab] = useState(() => localStorage.getItem('activeTab') || 'email')
  const [logoAvailable, setLogoAvailable] = useState(false)
  const [radarMounted, setRadarMounted] = useState(tab === 'radar')
  const { currentCode, previousCode, progressKey, intervalMs } = useRotatingCode()
  const headerRef = useRef(null)

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  /** Load group and contact data from the preloaded Excel files. */
  const loadData = useCallback(async () => {
    const { emailData, contactData } = await window.nocListAPI.loadExcelData()
    setEmailData(emailData)
    setContactData(contactData)
    setLastRefresh(new Date().toLocaleString())
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    fetch('logo.png', { method: 'HEAD' })
      .then((res) => {
        if (res.ok) setLogoAvailable(true)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    let cleanup
    if (window.nocListAPI?.onExcelDataUpdate) {
      cleanup = window.nocListAPI.onExcelDataUpdate((data) => {
        toast.success('Excel files updated automatically!')
        setEmailData(data.emailData || [])
        setContactData(data.contactData || [])
        setLastRefresh(new Date().toLocaleString())
      })
    }
    return () => cleanup && cleanup()
  }, [])

  useEffect(() => {
    let cleanup
    if (window.nocListAPI?.onExcelWatchError) {
      cleanup = window.nocListAPI.onExcelWatchError((msg) => {
        toast.error(`Watcher error: ${msg}`)
      })
    }
    return () => cleanup && cleanup()
  }, [])

  /** Manually refresh Excel data and clear any ad-hoc emails. */
  const refreshData = useCallback(async () => {
    await loadData()
    setAdhocEmails([])
    toast.success('Data refreshed')
  }, [loadData])

  const isValidEmail = useCallback((email) => emailRegex.test(email), [])

  /** Add a user-provided email to the current ad-hoc list if valid. */
  const addAdhocEmail = useCallback(
    (email, { switchToEmailTab = false } = {}) => {
      const cleaned = typeof email === 'string' ? email.trim() : ''
      const normalized = cleaned.toLowerCase()

      if (!cleaned || !isValidEmail(cleaned)) {
        return 'invalid'
      }

      /** @type {'added' | 'duplicate'} */
      let status = 'duplicate'

      setAdhocEmails((prev) => {
        if (prev.some((existing) => existing.toLowerCase() === normalized)) {
          return prev
        }

        status = 'added'
        return [...prev, cleaned]
      })

      if (status === 'added' && switchToEmailTab) {
        setTab('email')
      }

      return status
    },
    [isValidEmail, setTab],
  )

  useLayoutEffect(() => {
    const updateHeaderOffset = () => {
      const computedStyles = getComputedStyle(document.documentElement)
      const shellGap = parseFloat(computedStyles.getPropertyValue('--app-shell-gap') || '0')
      const headerHeight = headerRef.current?.offsetHeight ?? 0
      const offset = headerHeight + shellGap
      document.documentElement.style.setProperty('--app-header-offset', `${Math.round(offset)}px`)
    }

    updateHeaderOffset()

    const resizeObserver =
      typeof ResizeObserver !== 'undefined' && headerRef.current
        ? new ResizeObserver(updateHeaderOffset)
        : null

    resizeObserver?.observe(headerRef.current)

    window.addEventListener('resize', updateHeaderOffset)

    return () => {
      window.removeEventListener('resize', updateHeaderOffset)
      resizeObserver?.disconnect()
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('activeTab', tab)
  }, [tab])

  useEffect(() => {
    if (tab === 'radar') setRadarMounted(true)
  }, [tab])

  const toastOptions = useMemo(
    () => ({
      style: {
        background: 'var(--bg-secondary)',
        color: 'var(--text-light)',
        border: '1px solid var(--border-color)',
        fontSize: '0.9rem',
        borderRadius: '6px',
        fontFamily: 'DM Sans, sans-serif',
      },
      success: {
        icon: '✓',
        style: {
          background: 'var(--toast-success-bg)',
          color: 'var(--text-light)',
        },
      },
      error: {
        icon: '✕',
        style: {
          background: 'var(--toast-error-bg)',
          color: 'var(--text-light)',
        },
      },
    }),
    [],
  )

  return (
    <div className="app-shell fade-in">
      <Toaster position="top-right" toastOptions={toastOptions} />

      <header className="app-header" ref={headerRef}>
        <div className="app-header-card">
          <div className="app-header-row">
            <div className="identity-card">
              <div className="identity-card__figure">
                {logoAvailable ? (
                  <img src="logo.png" alt="NOC List logo" className="app-logo" />
                ) : (
                  <div className="app-logo-fallback" aria-label="NOC List logo">
                    <span>NOC</span>
                    <span>LIST</span>
                  </div>
                )}
              </div>
              <div className="identity-card__content">
                <div className="identity-card__code">
                  <CodeDisplay
                    currentCode={currentCode}
                    previousCode={previousCode}
                    progressKey={progressKey}
                    intervalMs={intervalMs}
                  />
                </div>
                <span className="identity-card__divider" aria-hidden="true" />
                <div className="identity-card__clock">
                  <WeatherClock />
                </div>
              </div>
            </div>

            <div className="app-header-controls">
              <TabSelector tab={tab} setTab={setTab} />

              {tab !== 'radar' && (
                <div className="app-toolbar">
                  <button onClick={refreshData} className="btn btn-ghost">
                    Refresh
                  </button>
                  <span className="app-toolbar-meta">Updated {lastRefresh}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="app-main">
        {tab === 'email' && (
          <div className="module-card">
            <EmailGroups
              emailData={emailData}
              adhocEmails={adhocEmails}
              selectedGroups={selectedGroups}
              setSelectedGroups={setSelectedGroups}
              setAdhocEmails={setAdhocEmails}
            />
          </div>
        )}

        {tab === 'contact' && (
          <div className="module-card">
            <ContactSearch
              contactData={contactData}
              addAdhocEmail={addAdhocEmail}
            />
          </div>
        )}

        {radarMounted && (
          <div
            className="module-card module-card--radar"
            style={{ display: tab === 'radar' ? 'flex' : 'none' }}
          >
            <DispatcherRadar />
          </div>
        )}
      </main>
    </div>
  )
}

export default App
