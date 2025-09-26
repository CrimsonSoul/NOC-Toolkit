import React, {
  useMemo,
  useState,
  useCallback,
  useRef,
  useEffect,
  memo,
} from 'react'
import { toast } from 'react-hot-toast'
import { findEmailAddress, getContactInitials } from '../utils/findEmailAddress'
import { formatPhones } from '../utils/formatPhones'

const PHONE_FIELDS = [
  'Phone',
  'PhoneNumber',
  'Phone Number',
  'Primary Phone',
  'Primary Phone Number',
  'Business Phone',
  'Business Phone Number',
  'Work Phone',
  'WorkPhone',
  'Mobile Phone',
  'MobilePhone',
  'Mobile',
  'Cell',
  'Cell Phone',
  'Telephone',
  'Tel',
]

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
  contactData = [],
  addAdhocEmail,
}) => {
  const [copied, setCopied] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [removedEmails, setRemovedEmails] = useState([])
  const [removedManualEmails, setRemovedManualEmails] = useState([])
  const [isContactPickerOpen, setIsContactPickerOpen] = useState(false)
  const [contactQuery, setContactQuery] = useState('')
  const timeoutRef = useRef(null)
  const contactSearchRef = useRef(null)

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

  const indexedContacts = useMemo(() => {
    return contactData.map((contact, index) => {
      const phoneField = PHONE_FIELDS.find((field) => contact?.[field])
      const phoneValue = phoneField ? contact[phoneField] : contact?.Phone
      const key =
        contact?.Email ||
        contact?.EmailAddress ||
        contact?.['Email Address'] ||
        contact?.email ||
        contact?.['E-mail'] ||
        contact?.Name ||
        index

      return {
        raw: contact,
        key,
        email: findEmailAddress(contact),
        initials: getContactInitials(contact?.Name),
        phone: phoneValue,
        formattedPhone: formatPhones(phoneValue),
        searchText: Object.values(contact)
          .map((value) => (value == null ? '' : String(value)))
          .join(' ')
          .toLowerCase(),
      }
    })
  }, [contactData])

  const filteredContacts = useMemo(() => {
    const term = contactQuery.trim().toLowerCase()
    const list = term
      ? indexedContacts.filter((contact) => contact.searchText.includes(term))
      : indexedContacts
    return list.slice(0, 250)
  }, [contactQuery, indexedContacts])

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

  const activeEmailSet = useMemo(() => {
    return new Set(activeEmails.map((email) => email.toLowerCase()))
  }, [activeEmails])

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

  const handleAddContactEmail = useCallback(
    (contact) => {
      if (!addAdhocEmail) return
      const email = contact.email

      if (!email) {
        toast.error('No email address available for this contact')
        return
      }

      const result = addAdhocEmail(email)

      if (result === 'added') {
        toast.success(`Added ${email} to the list`)
      } else if (result === 'duplicate') {
        toast('Email already in list', { icon: 'ℹ️' })
      } else {
        toast.error('Invalid email address')
      }
    },
    [addAdhocEmail],
  )

  useEffect(() => {
    setRemovedManualEmails((prev) => {
      if (!prev.length) return prev
      const restored = prev.filter((email) => !adhocEmails.includes(email))
      return restored.length === prev.length ? prev : restored
    })
  }, [adhocEmails])

  useEffect(() => {
    if (!isContactPickerOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsContactPickerOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    contactSearchRef.current?.focus()

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isContactPickerOpen])

  const hasRemovedEmails = removedEmails.length > 0 || removedManualEmails.length > 0

  return (
    <div className="email-groups">
      <div className="sticky-header">
        <div className="stack-on-small align-center gap-0-5 mb-1">
          <div className="button-group">
            <button
              onClick={() => window.nocListAPI?.openFile?.('groups.xlsx')}
              className="btn btn-secondary"
            >
              Open Email Groups Excel
            </button>
            <button
              onClick={() => {
                setIsContactPickerOpen(true)
                setContactQuery('')
              }}
              className="btn btn-outline"
              type="button"
            >
              Add Individual Contacts
            </button>
          </div>
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

      {activeEmails.length > 0 && (
        <>
          <div className="email-actions">
            <button onClick={copyToClipboard} className="btn btn-secondary">
              Copy Email List
            </button>
            <button onClick={launchTeams} className="btn btn-accent">
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

      {(selectedGroups.length > 0 || adhocEmails.length > 0 || hasRemovedEmails) && (
        <div className="email-secondary-actions">
          {(selectedGroups.length > 0 || adhocEmails.length > 0) && (
            <button onClick={clearAll} className="btn btn-secondary">
              Clear All
            </button>
          )}
          {hasRemovedEmails && (
            <button onClick={restoreRemovedEmails} className="btn btn-outline">
              Restore Removed Emails
            </button>
          )}
        </div>
      )}

      {isContactPickerOpen && (
        <div
          className="contact-picker-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Contact picker"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setIsContactPickerOpen(false)
            }
          }}
        >
          <div className="contact-picker">
            <div className="contact-picker__header">
              <div>
                <h2 className="contact-picker__title">Add Individual Contacts</h2>
                <p className="small-muted m-0">
                  {contactData.length > 0
                    ? `Browse ${contactData.length.toLocaleString()} contacts to add individuals.`
                    : 'No contacts available.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsContactPickerOpen(false)}
                className="btn btn-ghost"
                aria-label="Close contact picker"
              >
                Close
              </button>
            </div>

            <div className="contact-picker__search">
              <div className="input-wrapper">
                <input
                  ref={contactSearchRef}
                  type="text"
                  placeholder="Search contacts..."
                  value={contactQuery}
                  onChange={e => setContactQuery(e.target.value)}
                  className="input search-input"
                />
                {contactQuery && (
                  <button
                    onClick={() => setContactQuery('')}
                    className="clear-btn"
                    title="Clear contact search"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            <div className="contact-picker__list minimal-scrollbar">
              {filteredContacts.length > 0 ? (
                filteredContacts.map((contact) => {
                  const normalizedEmail = contact.email?.toLowerCase()
                  const isAlreadyAdded = normalizedEmail
                    ? activeEmailSet.has(normalizedEmail)
                    : false

                  return (
                    <article key={contact.key} className="contact-picker__item">
                      <div className="contact-picker__identity">
                        <div className="contact-picker__avatar">{contact.initials}</div>
                        <div>
                          <h3 className="contact-picker__name">{contact.raw.Name || contact.email || 'Unknown'}</h3>
                          {contact.raw.Title && (
                          <p className="contact-picker__title">{contact.raw.Title}</p>
                        )}
                      </div>
                    </div>
                    <div className="contact-picker__details">
                      <div>
                        <span className="label">Email</span>
                        {contact.email ? (
                          <a href={`mailto:${contact.email}`}>{contact.email}</a>
                        ) : (
                          <span>Not available</span>
                        )}
                      </div>
                      <div>
                        <span className="label">Phone</span>
                        <span>{contact.formattedPhone || 'Not available'}</span>
                      </div>
                    </div>
                    <div className="contact-picker__actions">
                      <button
                        type="button"
                        className="btn btn-outline btn-small"
                        onClick={() => handleAddContactEmail(contact)}
                        disabled={!addAdhocEmail || !contact.email || isAlreadyAdded}
                      >
                        {!contact.email
                          ? 'Email Unavailable'
                          : isAlreadyAdded
                            ? 'Already Added'
                            : 'Add to List'}
                      </button>
                    </div>
                    </article>
                  )
                })
              ) : (
                <div className="empty-state">No contacts match your search.</div>
              )}
            </div>
            {!contactQuery && indexedContacts.length > filteredContacts.length && (
              <p className="small-muted m-0">
                Showing the first {filteredContacts.length} contacts. Use search to find others.
              </p>
            )}
          </div>
        </div>
      )}

    </div>
  )
}

export default memo(EmailGroups)
