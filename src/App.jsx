import React, { useEffect, useState } from 'react'
import EmailGroups from './components/EmailGroups'
import ContactSearch from './components/ContactSearch'
import { Toaster, toast } from 'react-hot-toast'

function App() {
  const [selectedGroups, setSelectedGroups] = useState([])
  const [adhocEmails, setAdhocEmails] = useState([])
  const [emailData, setEmailData] = useState([])
  const [contactData, setContactData] = useState([])
  const [lastRefresh, setLastRefresh] = useState('N/A')
  const [tab, setTab] = useState(() => localStorage.getItem('activeTab') || 'email')
  const [logoAvailable, setLogoAvailable] = useState(false)
  const [currentCode, setCurrentCode] = useState('')
  const [previousCode, setPreviousCode] = useState('')
  const [progressKey, setProgressKey] = useState(Date.now())

  const generateCode = () => Math.floor(10000 + Math.random() * 90000).toString()

  useEffect(() => {
    const { emailData, contactData } = window.nocListAPI.loadExcelData()
    setEmailData(emailData)
    setContactData(contactData)
    setLastRefresh(new Date().toLocaleString())
    setCurrentCode(generateCode())
    setProgressKey(Date.now())
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      setPreviousCode(currentCode)
      setCurrentCode(generateCode())
      setProgressKey(Date.now())
    }, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [currentCode])

  useEffect(() => {
    fetch('logo.png', { method: 'HEAD' })
      .then((res) => {
        if (res.ok) setLogoAvailable(true)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (window.nocListAPI?.onExcelDataUpdate) {
      window.nocListAPI.onExcelDataUpdate((data) => {
        toast.success('Excel files updated automatically!')
        setEmailData(data.emailData || [])
        setContactData(data.contactData || [])
        setLastRefresh(new Date().toLocaleString())
      })
    }
  }, [])

  const refreshData = () => {
    const { emailData, contactData } = window.nocListAPI.loadExcelData()
    setEmailData(emailData)
    setContactData(contactData)
    setLastRefresh(new Date().toLocaleString())
    setAdhocEmails([])
    toast.success('Data refreshed')
  }

  const isValidEmail = (email) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

  const addAdhocEmail = (email) => {
    if (isValidEmail(email)) {
      setAdhocEmails(prev => [...new Set([...prev, email])])
      toast.success(`Added ${email}`)
    } else {
      toast.error('Invalid email address')
    }
  }

  useEffect(() => {
    localStorage.setItem('activeTab', tab)
  }, [tab])

  const toastOptions = {
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
  };

  return (
    <div className="app-shell fade-in">
      <Toaster position="top-right" toastOptions={toastOptions} />
      <div className="code-widget">
        <div className="code-widget__current">Code: {currentCode}</div>
        <div className="code-widget__previous">Prev: {previousCode || 'N/A'}</div>
        <div className="progress-container">
          <div key={progressKey} className="progress-bar" />
        </div>
      </div>
      <header className="app-header">
        {logoAvailable ? (
          <img src="logo.png" alt="NOC List Logo" className="app-logo" />
        ) : (
          <pre
            style={{
              fontFamily: 'monospace',
              fontSize: '1rem',
              margin: 0,
              lineHeight: '1.2',
            }}
          >
            {`    _   ______  ______   __    _      __
   / | / / __ \/ ____/  / /   (_)____/ /_
  /  |/ / / / / /      / /   / / ___/ __/
 / /|  / /_/ / /___   / /___/ (__  ) /_
/_/ |_|\____/\____/  /_____/_/____/\__/`}
          </pre>
        )}
        <p className="header-note">Pick a tab and follow the simple steps to build your email list.</p>
      </header>

      <nav className="tab-strip stack-on-small">
        <button
          type="button"
          onClick={() => setTab('email')}
          className={`tab-button ${tab === 'email' ? 'active' : ''}`}
        >
          Email Groups
        </button>
        <button
          type="button"
          onClick={() => setTab('contact')}
          className={`tab-button ${tab === 'contact' ? 'active' : ''}`}
        >
          Contact Search
        </button>
      </nav>

      <div className="refresh-row stack-on-small">
        <button
          onClick={refreshData}
          className="btn btn-secondary"
        >
          Refresh Data
        </button>
        <span className="refresh-note">Last refreshed: {lastRefresh}</span>
        <span className="refresh-hint">Tap refresh if the sheets change.</span>
      </div>

      {tab === 'email' ? (
        <EmailGroups
          emailData={emailData}
          adhocEmails={adhocEmails}
          selectedGroups={selectedGroups}
          setSelectedGroups={setSelectedGroups}
          setAdhocEmails={setAdhocEmails}
        />
      ) : (
        <ContactSearch
          contactData={contactData}
          addAdhocEmail={addAdhocEmail}
        />
      )}
    </div>
  )
}

export default App
