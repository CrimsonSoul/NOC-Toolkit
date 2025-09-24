import React, { useMemo, useState, useCallback, useRef, useEffect, memo } from 'react'
import { toast } from 'react-hot-toast'

/**
 * Manage selection of email groups and creation of merged mailing lists.
 * @param {Object} props
 * @param {Array} props.emailData - Raw group data from Excel.
 * @param {string[]} props.adhocEmails - Manually added emails.
 * @param {string[]} props.selectedGroups - Currently selected group names.
 * @param {Function} props.setSelectedGroups - Setter for group selection.
 * @param {Function} props.setAdhocEmails - Setter for ad-hoc emails.
 */
const EmailGroups = ({
  emailData,
  adhocEmails,
  selectedGroups,
  setSelectedGroups,
  setAdhocEmails,
}) => {
  const [copied, setCopied] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [removedEmails, setRemovedEmails] = useState([])
  const [removedManualEmails, setRemovedManualEmails] = useState([])
  const timeoutRef = useRef(null)

  const groups = useMemo(() => {
    if (emailData.length === 0) return []
    const [headers, ...rows] = emailData
    return headers.map((name, i) => ({
      name,
      emails: rows.map(row => row[i]).filter(Boolean),
      _search: name.toLowerCase(),
    }))
  }, [emailData])

  useEffect(() => {
    const handle = setTimeout(() => setSearch(searchInput), 300)
    return () => clearTimeout(handle)
  }, [searchInput])

  const filteredGroups = useMemo(() => {
    const term = search.toLowerCase()
    return groups.filter((group) => group._search.includes(term))
  }, [groups, search])

  const groupMap = useMemo(
    () => new Map(groups.map((g) => [g.name, g.emails])),
    [groups],
  )

  const mergedEmails = useMemo(() => {
    const all = selectedGroups.flatMap((name) => groupMap.get(name) || [])
    return [...new Set([...all, ...adhocEmails])]
  }, [selectedGroups, groupMap, adhocEmails])

  const activeEmails = useMemo(
    () => mergedEmails.filter((email) => !removedEmails.includes(email)),
    [mergedEmails, removedEmails],
  )

  useEffect(() => {
    setRemovedEmails((prev) => {
      if (prev.length === 0) return prev
      const filtered = prev.filter((email) => mergedEmails.includes(email))
      return filtered.length === prev.length ? prev : filtered
    })
  }, [mergedEmails])

  const toggleSelect = useCallback(
    (name) => {
      setSelectedGroups((prev) =>
        prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
      )
    },
    [setSelectedGroups],
  )

  const clearAll = useCallback(() => {
    setSelectedGroups([])
    setAdhocEmails([])
    setRemovedEmails([])
    setRemovedManualEmails([])
  }, [setSelectedGroups, setAdhocEmails, setRemovedManualEmails])

  const copyToClipboard = useCallback(async () => {
    if (activeEmails.length === 0) return
    try {
      await navigator.clipboard.writeText(activeEmails.join(', '))
      setCopied(true)
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      timeoutRef.current = setTimeout(() => {
        setCopied(false)
        timeoutRef.current = null
      }, 2000)
      toast.success('Email list copied to clipboard')
    } catch {
      toast.error('Failed to copy')
    }
  }, [activeEmails])

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  const launchTeams = useCallback(() => {
    if (activeEmails.length === 0) return
    const now = new Date()
    const title = `${now.getMonth() + 1}/${now.getDate()}`
    const url =
      `https://teams.microsoft.com/l/meeting/new?subject=${encodeURIComponent(
        title,
      )}&attendees=${encodeURIComponent(activeEmails.join(','))}`
    window.nocListAPI?.openExternal?.(url)
    toast.success('Opening Teams meeting')
  }, [activeEmails])

  const handleRemoveEmail = useCallback(
    (email) => {
      if (adhocEmails.includes(email)) {
        setAdhocEmails((prev) => prev.filter((item) => item !== email))
        setRemovedManualEmails((prev) => (prev.includes(email) ? prev : [...prev, email]))
      } else {
        setRemovedEmails((prev) => (prev.includes(email) ? prev : [...prev, email]))
      }
    },
    [adhocEmails, setAdhocEmails, setRemovedEmails, setRemovedManualEmails],
  )

  const restoreRemovedEmails = useCallback(() => {
    setRemovedEmails([])
    if (removedManualEmails.length > 0) {
      setAdhocEmails((prev) => {
        const merged = new Set(prev)
        removedManualEmails.forEach((email) => merged.add(email))
        return Array.from(merged)
      })
      setRemovedManualEmails([])
    }
  }, [removedManualEmails, setAdhocEmails, setRemovedManualEmails])

  useEffect(() => {
    setRemovedManualEmails((prev) => {
      if (!prev.length) return prev
      const restored = prev.filter((email) => !adhocEmails.includes(email))
      return restored.length === prev.length ? prev : restored
    })
  }, [adhocEmails])

  const hasRemovedEmails = removedEmails.length > 0 || removedManualEmails.length > 0

  return (
    <div className="email-groups">
      <div className="sticky-header">
        <div className="stack-on-small align-center gap-0-5 mb-1">
          <button
            onClick={() => window.nocListAPI?.openFile?.('groups.xlsx')}
            className="btn btn-secondary"
          >
            Open Email Groups Excel
          </button>
          <div className="input-wrapper">
            <input
              type="text"
              placeholder="Search groups..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              className="input search-input"
            />
            {searchInput && (
              <button
                onClick={() => {
                  setSearchInput('')
                  setSearch('')
                }}
                className="clear-btn"
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>
        </div>
        <p className="small-muted m-0">
          Tap a group to add it to the combined mailing list below.
        </p>
      </div>

      <div className="list-surface minimal-scrollbar">
        {filteredGroups.length > 0 ? (
          <div className="group-grid">
            {filteredGroups.map((group) => (
              <button
                key={group.name}
                onClick={() => toggleSelect(group.name)}
                className={`list-item-button ${
                  selectedGroups.includes(group.name) ? 'is-selected' : ''
                }`}
              >
                <span>{group.name}</span>
                <span className="item-count">{group.emails.length} contacts</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="empty-state">No groups match your search.</div>
        )}

      </div>

      {(selectedGroups.length > 0 || adhocEmails.length > 0 || hasRemovedEmails) && (
        <div className="email-secondary-actions">
          {(selectedGroups.length > 0 || adhocEmails.length > 0) && (
            <button onClick={clearAll} className="btn btn-secondary">
              Reset Selected Groups & Emails
            </button>
          )}
          {hasRemovedEmails && (
            <button onClick={restoreRemovedEmails} className="btn btn-ghost">
              Restore Removed Emails
            </button>
          )}
        </div>
      )}

      {activeEmails.length > 0 && (
        <>
          <div className="email-actions">
            <button onClick={copyToClipboard} className="btn">
              Copy Email List
            </button>
            <button onClick={launchTeams} className="btn btn-secondary">
              Start Teams Meeting
            </button>
            {copied && <span className="copied-indicator">Copied</span>}
          </div>
          <div className="email-chip-grid minimal-scrollbar" role="list">
            {activeEmails.map((email) => (
              <button
                key={email}
                type="button"
                className="email-chip"
                onClick={() => handleRemoveEmail(email)}
                title={`Remove ${email}`}
                role="listitem"
              >
                <span className="email-chip__text">{email}</span>
                <span aria-hidden="true" className="email-chip__remove">×</span>
                <span className="sr-only">Remove {email}</span>
              </button>
            ))}
          </div>
          <p className="small-muted m-0">Tap an email to remove it from the list.</p>
        </>
      )}

    </div>
  )
}

export default memo(EmailGroups)
