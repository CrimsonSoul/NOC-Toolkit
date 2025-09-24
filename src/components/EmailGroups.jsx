import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import { toast } from 'react-hot-toast'
import { FixedSizeList as List } from 'react-window'

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
  }, [setSelectedGroups, setAdhocEmails])

  const copyToClipboard = useCallback(async () => {
    if (mergedEmails.length === 0) return
    try {
      await navigator.clipboard.writeText(mergedEmails.join(', '))
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
  }, [mergedEmails])

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  const launchTeams = useCallback(() => {
    if (mergedEmails.length === 0) return
    const now = new Date()
    const title = `${now.getMonth() + 1}/${now.getDate()}`
    const url =
      `https://teams.microsoft.com/l/meeting/new?subject=${encodeURIComponent(
        title,
      )}&attendees=${encodeURIComponent(mergedEmails.join(','))}`
    window.nocListAPI?.openExternal?.(url)
    toast.success('Opening Teams meeting')
  }, [mergedEmails])

  const GROUP_ITEM_HEIGHT = 80

  const listHeight = useMemo(
    () => Math.min(Math.max(filteredGroups.length * GROUP_ITEM_HEIGHT, 240), 420),
    [filteredGroups.length],
  )

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
          <List
            height={listHeight}
            itemCount={filteredGroups.length}
            itemSize={GROUP_ITEM_HEIGHT}
            width="100%"
          >
            {({ index, style }) => {
              const group = filteredGroups[index]
              return (
                <div
                  style={{ ...style, padding: '0.35rem 0.25rem' }}
                  className="virtual-button-row"
                >
                  <button
                    onClick={() => toggleSelect(group.name)}
                    className={`list-item-button ${
                      selectedGroups.includes(group.name) ? 'is-selected' : ''
                    }`}
                  >
                    <span>{group.name}</span>
                    <span className="item-count">{group.emails.length} contacts</span>
                  </button>
                </div>
              )
            }}
          </List>
        ) : (
          <div className="empty-state">No groups match your search.</div>
        )}

        {(selectedGroups.length > 0 || adhocEmails.length > 0) && (
          <button onClick={clearAll} className="btn btn-secondary mt-0-5">
            Clear All
          </button>
        )}
      </div>

      {mergedEmails.length > 0 && (
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
          <div className="email-output">
            <strong>Merged Emails:</strong>
            <div className="break-word mt-0-5">{mergedEmails.join(', ')}</div>
          </div>
        </>
      )}
    </div>
  )
}

export default EmailGroups
