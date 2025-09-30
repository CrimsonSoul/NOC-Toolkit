import React, { useEffect, useState, useCallback, useMemo, useRef, useLayoutEffect } from 'react'
import EmailGroups from './components/EmailGroups'
import ContactSearch from './components/ContactSearch'
import CodeDisplay from './components/CodeDisplay'
import Clock from './components/Clock'
import TabSelector from './components/TabSelector'
import DispatcherRadar from './components/DispatcherRadar'
import AuthPrompt from './components/AuthPrompt'
import { Toaster, toast } from 'react-hot-toast'
import useRotatingCode from './hooks/useRotatingCode'

const refreshTimestampFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

const formatRefreshTimestamp = (date) => refreshTimestampFormatter.format(date)

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const VALID_TABS = new Set(['email', 'contact', 'radar'])

const getStoredTabPreference = () => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null
  }

  try {
    const stored = window.localStorage.getItem('activeTab')
    return VALID_TABS.has(stored) ? stored : null
  } catch (error) {
    console.warn('Unable to read active tab preference:', error)
    return null
  }
}

function App() {
  const [selectedGroups, setSelectedGroups] = useState([])
  const [adhocEmails, setAdhocEmails] = useState([])
  const [emailData, setEmailData] = useState([])
  const [contactData, setContactData] = useState([])
  const [lastRefresh, setLastRefresh] = useState('N/A')
  const [tab, setTabState] = useState(() => getStoredTabPreference() || 'email')
  const [radarMounted, setRadarMounted] = useState(tab === 'radar')
  const { currentCode, previousCode, progressKey, intervalMs } = useRotatingCode()
  const headerRef = useRef(null)
  const [authChallenge, setAuthChallenge] = useState(null)
  const [authSubmitting, setAuthSubmitting] = useState(false)
  const lastAuthUsername = useRef('')

  const setTab = useCallback((nextTab) => {
    if (VALID_TABS.has(nextTab)) {
      setTabState(nextTab)
    }
  }, [])

  /** Load group and contact data from the preloaded Excel files. */
  const loadData = useCallback(async () => {
    if (!window.nocListAPI?.loadExcelData) {
      console.error('Excel bridge unavailable: unable to load data.')
      toast.error('Unable to load Excel data: desktop bridge unavailable.')
      setEmailData([])
      setContactData([])
      setLastRefresh('N/A')
      return false
    }

    try {
      const { emailData: nextEmailData = [], contactData: nextContactData = [] } =
        await window.nocListAPI.loadExcelData()
      setEmailData(nextEmailData)
      setContactData(nextContactData)
      setLastRefresh(formatRefreshTimestamp(new Date()))
      return true
    } catch (error) {
      console.error('Failed to load Excel data:', error)
      toast.error('Unable to load Excel data. Please try again.')
      setEmailData([])
      setContactData([])
      setLastRefresh('N/A')
      return false
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    if (!window.nocListAPI?.onExcelDataUpdate) {
      return undefined
    }

    const unsubscribe = window.nocListAPI.onExcelDataUpdate((data) => {
      toast.success('Excel files updated automatically!')
      setEmailData(data.emailData || [])
      setContactData(data.contactData || [])
      setLastRefresh(formatRefreshTimestamp(new Date()))
    })

    return () => unsubscribe?.()
  }, [])

  useEffect(() => {
    if (!window.nocListAPI?.onExcelWatchError) {
      return undefined
    }

    const unsubscribe = window.nocListAPI.onExcelWatchError((msg) => {
      toast.error(`Watcher error: ${msg}`)
    })

    return () => unsubscribe?.()
  }, [])

  useEffect(() => {
    if (!window.nocListAPI?.onAuthChallenge) {
      return undefined
    }

    const unsubscribe = window.nocListAPI.onAuthChallenge((challenge) => {
      setAuthSubmitting(false)
      setAuthChallenge({
        ...challenge,
        usernameHint:
          challenge?.usernameHint || challenge?.username || lastAuthUsername.current || '',
      })
    })

    return () => unsubscribe?.()
  }, [])

  /** Manually refresh Excel data and clear any ad-hoc emails. */
  const refreshData = useCallback(async () => {
    const refreshed = await loadData()
    if (refreshed) {
      setAdhocEmails([])
      toast.success('Data refreshed')
    }
  }, [loadData])

  const isValidEmail = useCallback((email) => EMAIL_REGEX.test(email), [])

  /** Add a user-provided email to the current ad-hoc list if valid. */
  const addAdhocEmail = useCallback(
    (email, { switchToEmailTab = false } = {}) => {
      const cleaned = typeof email === 'string' ? email.trim() : ''
      const normalized = cleaned.toLowerCase()

      if (!cleaned || !isValidEmail(cleaned)) {
        return 'invalid'
      }

      let status = 'added'

      setAdhocEmails((prev) => {
        const alreadyExists = prev.some(
          (existing) => existing.toLowerCase() === normalized,
        )

        if (alreadyExists) {
          status = 'duplicate'
          return prev
        }

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
    if (typeof window === 'undefined' || !window.localStorage) {
      return
    }

    if (!VALID_TABS.has(tab)) {
      return
    }

    try {
      window.localStorage.setItem('activeTab', tab)
    } catch (error) {
      console.warn('Unable to persist active tab preference:', error)
    }
  }, [tab])

  useEffect(() => {
    if (tab === 'radar' && !radarMounted) {
      setRadarMounted(true)
    }
  }, [tab, radarMounted])

  const handleAuthSubmit = useCallback(
    async ({ username, password }) => {
      if (!authChallenge) return

      try {
        setAuthSubmitting(true)

        if (!window.nocListAPI?.provideAuthCredentials) {
          throw new Error('Authentication bridge unavailable.')
        }

        const result = await window.nocListAPI.provideAuthCredentials({
          id: authChallenge.id,
          username,
          password,
        })

        if (!result || result.status === 'error') {
          throw new Error(result?.message || 'Unable to send credentials.')
        }

        lastAuthUsername.current = username
        setAuthChallenge(null)
      } catch (error) {
        console.error('Failed to submit credentials:', error)
        toast.error(error?.message || 'Unable to send credentials.')
      } finally {
        setAuthSubmitting(false)
      }
    },
    [authChallenge],
  )

  const handleAuthCancel = useCallback(async () => {
    if (!authChallenge) {
      setAuthChallenge(null)
      return
    }

    try {
      setAuthSubmitting(true)

      if (!window.nocListAPI?.provideAuthCredentials) {
        throw new Error('Authentication bridge unavailable.')
      }

      await window.nocListAPI.provideAuthCredentials({
        id: authChallenge.id,
        cancel: true,
      })

      setAuthChallenge(null)
    } catch (error) {
      console.error('Failed to cancel authentication request:', error)
      toast.error(error?.message || 'Unable to dismiss prompt.')
    } finally {
      setAuthSubmitting(false)
    }
  }, [authChallenge])

  const toastOptions = useMemo(
    () => ({
      style: {
        background: 'var(--bg-secondary)',
        color: 'var(--text-light)',
        border: '1px solid var(--border-color)',
        fontSize: '0.9rem',
        borderRadius: '6px',
        fontFamily: 'Barlow, DM Sans, sans-serif',
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
    <div className={`app-shell fade-in${tab === 'radar' ? ' app-shell--radar' : ''}`}>
      <Toaster position="top-right" toastOptions={toastOptions} />

      <header className="app-header" ref={headerRef}>
        <div className="app-header-card">
          <div className="app-header__cluster">
            <span className="app-header__title" aria-label="NOC Toolkit">
              NOC Toolkit
            </span>
          </div>
          <div className="app-header__code">
            <CodeDisplay
              currentCode={currentCode}
              previousCode={previousCode}
              progressKey={progressKey}
              intervalMs={intervalMs}
            />
          </div>
          <div className="app-header__status">
            <Clock />
            <div
              className={`app-header__refresh${tab === 'radar' ? ' app-header__refresh--hidden' : ''}`}
              aria-hidden={tab === 'radar'}
            >
              <button
                onClick={refreshData}
                className="btn btn-ghost"
                tabIndex={tab === 'radar' ? -1 : undefined}
              >
                Refresh
              </button>
              <span className="app-header__timestamp">Updated {lastRefresh}</span>
            </div>
          </div>
          <div className="app-header__tabs">
            <TabSelector tab={tab} setTab={setTab} />
          </div>
        </div>
      </header>

      <main className={`app-main${tab === 'radar' ? ' app-main--radar' : ''}`}>
        {tab === 'email' && (
          <div className="module-card">
            <EmailGroups
              emailData={emailData}
              adhocEmails={adhocEmails}
              selectedGroups={selectedGroups}
              setSelectedGroups={setSelectedGroups}
              setAdhocEmails={setAdhocEmails}
              contactData={contactData}
              addAdhocEmail={addAdhocEmail}
            />
          </div>
        )}

        {tab === 'contact' && (
          <div className="module-card module-card--contacts">
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

      {authChallenge ? (
        <AuthPrompt
          key={authChallenge.id}
          challenge={authChallenge}
          submitting={authSubmitting}
          onSubmit={handleAuthSubmit}
          onCancel={handleAuthCancel}
        />
      ) : null}
    </div>
  )
}

export default App
