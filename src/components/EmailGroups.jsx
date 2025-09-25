import React, { useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'

const EmailGroups = ({ emailData, adhocEmails, selectedGroups, setSelectedGroups, setAdhocEmails }) => {
  const [copied, setCopied] = useState(false)
  const [search, setSearch] = useState('')

  const groups = useMemo(() => {
    if (emailData.length === 0) return []
    const [headers, ...rows] = emailData
    return headers.map((name, i) => ({
      name,
      emails: rows.map(row => row[i]).filter(Boolean)
    }))
  }, [emailData])

  const filteredGroups = useMemo(() => {
    return groups.filter(group =>
      group.name.toLowerCase().includes(search.toLowerCase())
    )
  }, [groups, search])

  const mergedEmails = useMemo(() => {
    const all = selectedGroups.flatMap(name => {
      const group = groups.find(g => g.name === name)
      return group ? group.emails : []
    })
    return [...new Set([...all, ...adhocEmails])]
  }, [selectedGroups, groups, adhocEmails])

  const toggleSelect = name => {
    setSelectedGroups(prev =>
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    )
  }

  const clearAll = () => {
    setSelectedGroups([])
    setAdhocEmails([])
  }

  const copyToClipboard = () => {
    if (mergedEmails.length > 0) {
      navigator.clipboard.writeText(mergedEmails.join(', '))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      toast.success('Email list copied to clipboard')
    }
  }

  const launchTeams = () => {
    if (mergedEmails.length > 0) {
      const now = new Date()
      const title = `${now.getMonth() + 1}/${now.getDate()}`
      const url =
        `https://teams.microsoft.com/l/meeting/new?subject=${encodeURIComponent(title)}&attendees=${encodeURIComponent(mergedEmails.join(','))}`
      window.nocListAPI?.openExternal?.(url)
      toast.success('Opening Teams meeting')
    }
  }

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <button
          onClick={() => window.nocListAPI?.openFile?.('groups.xlsx')}
          className="btn btn-secondary"
        >
          Open Email Groups Excel
        </button>
      </div>

      <p className="helper-text">Click a group to add everyone inside it.</p>

      <div className="stack-on-small" style={{ alignItems: 'center', marginBottom: '1.5rem', gap: '0.75rem' }}>
        <div style={{ position: 'relative', flex: '1 1 250px', maxWidth: '300px' }}>
          <input
            type="text"
            placeholder="Search groups..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input"
            style={{ width: '100%', paddingRight: '1.75rem' }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="clear-btn"
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.5rem' }}>
        {filteredGroups.map(group => (
          <button
            key={group.name}
            onClick={() => toggleSelect(group.name)}
            className="btn fade-in"
            style={{
              background: selectedGroups.includes(group.name)
                ? 'var(--button-active)'
                : 'var(--button-bg)',
              color: 'var(--text-light)'
            }}
          >
            {group.name}
            <span style={{ marginLeft: '0.25rem', fontSize: '0.8rem', color: 'var(--text-light)' }}>
              ({group.emails.length})
            </span>
          </button>
        ))}
        {(selectedGroups.length > 0 || adhocEmails.length > 0) && (
          <button onClick={clearAll} className="btn btn-secondary fade-in">
            Clear All
          </button>
        )}
      </div>

      {mergedEmails.length > 0 && (
        <>
          <div style={{ marginBottom: '0.5rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button onClick={copyToClipboard} className="btn btn-quiet fade-in">
              Copy Email List
            </button>
            <button onClick={launchTeams} className="btn btn-important fade-in">
              Start Teams Meeting
            </button>
            {copied && <span style={{ color: 'lightgreen', alignSelf: 'center' }}>Copied</span>}
          </div>
          <div className="info-card">
            <strong>Merged Emails:</strong>
            <div style={{ wordBreak: 'break-word', marginTop: '0.5rem' }}>
              {mergedEmails.join(', ')}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default EmailGroups
