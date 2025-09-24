import React, {
  useState,
  useMemo,
  useDeferredValue,
  useRef,
  useEffect,
  memo,
  useCallback,
} from 'react'
import { toast } from 'react-hot-toast'
import { formatPhones } from '../utils/formatPhones'

const EMAIL_FIELDS = [
  'Email',
  'EmailAddress',
  'Email Address',
  'EmailAddress1',
  'Email Address 1',
  'Email1',
  'Email 1',
  'Primary Email',
  'Primary Email Address',
  'E-mail',
  'E-mail Address',
  'SMTP',
  'SMTP Address',
  'User Email',
  'Work Email',
]

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi

const extractEmails = (value) => {
  if (!value) return []
  if (Array.isArray(value)) {
    return value.flatMap(extractEmails)
  }
  if (typeof value === 'string') {
    const matches = value.match(EMAIL_PATTERN)
    return matches ? matches.map((match) => match.trim()) : []
  }
  return []
}

const findEmailAddress = (contact) => {
  for (const field of EMAIL_FIELDS) {
    const emails = extractEmails(contact[field])
    if (emails.length > 0) {
      return emails[0]
    }
  }

  for (const value of Object.values(contact)) {
    const emails = extractEmails(value)
    if (emails.length > 0) {
      return emails[0]
    }
  }

  return ''
}

/**
 * Provide a searchable list of contacts with quick email adding.
 * @param {Object} props
 * @param {Array} props.contactData - Parsed contact rows.
 * @param {(email: string, options?: { switchToEmailTab?: boolean }) => 'added' | 'duplicate' | 'invalid'} props.addAdhocEmail - Callback to add emails.
 */
const ContactSearch = ({ contactData, addAdhocEmail }) => {
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const searchInputRef = useRef(null)
  const itemRefs = useRef([])
  const [activeIndex, setActiveIndex] = useState(-1)

  const indexedContacts = useMemo(
    () =>
      contactData.map((c) => ({
        ...c,
        _search: Object.values(c).join(' ').toLowerCase(),
      })),
    [contactData],
  )

  const filtered = useMemo(() => {
    const q = deferredQuery.toLowerCase()
    return indexedContacts.filter((c) => c._search.includes(q))
  }, [deferredQuery, indexedContacts])

  const getContactKey = useCallback((contact, index) => {
    return (
      contact?.Email ||
      contact?.EmailAddress ||
      contact?.['Email Address'] ||
      contact?.email ||
      contact?.['E-mail'] ||
      contact?.Name ||
      index
    )
  }, [])

  useEffect(() => {
    if (activeIndex >= 0) {
      const btn = itemRefs.current[activeIndex]
      if (btn) {
        btn.focus()
        btn.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
      }
    }
  }, [activeIndex, filtered])

  useEffect(() => {
    itemRefs.current = []
  }, [filtered])

  useEffect(() => {
    if (activeIndex >= filtered.length) {
      setActiveIndex(filtered.length ? filtered.length - 1 : -1)
    }
  }, [activeIndex, filtered.length])

  const handleKeyDown = useCallback(
    (e, index) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex(() => {
          const nextIndex = Math.min(filtered.length - 1, index + 1)
          return filtered.length ? nextIndex : -1
        })
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (index === 0) {
          setActiveIndex(-1)
          searchInputRef.current?.focus()
        } else {
          setActiveIndex(() => {
            const nextIndex = Math.max(0, index - 1)
            return filtered.length ? nextIndex : -1
          })
        }
      }
    },
    [filtered.length],
  )

  return (
    <div className="contact-search">
      <div className="sticky-header">
        <div className="stack-on-small align-center gap-0-5 mb-1">
          <button
            onClick={() => window.nocListAPI?.openFile?.('contacts.xlsx')}
            className="btn btn-secondary open-contact-btn"
          >
            Open Contact List Excel
          </button>
          <div className="input-wrapper">
            <input
              type="text"
              placeholder="Search contacts..."
              value={query}
              ref={searchInputRef}
              onChange={e => {
                setQuery(e.target.value)
                setActiveIndex(-1)
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown' && filtered.length) {
                  e.preventDefault()
                  setActiveIndex(0)
                }
              }}
              className="input rounded-6 search-input"
              style={{ '--clear-btn-space': '2.25rem' }}
            />
            {query && (
              <button onClick={() => setQuery('')} className="clear-btn" title="Clear search">
                ✕
              </button>
            )}
          </div>
        </div>
        <p className="small-muted m-0">Browse the directory and quickly add people to an ad-hoc list.</p>
      </div>

      {filtered.length > 0 ? (
        <div className="contact-list">
          {filtered.map((contact, index) => {
            const initials = contact.Name
              ? contact.Name.split(' ')
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((part) => part[0])
                  .join('')
                  .toUpperCase()
              : '?'
            const emailAddress = findEmailAddress(contact)

            const handleAddToList = () => {
              if (!emailAddress) {
                toast.error('No email address available for this contact')
                return
              }

              const result = addAdhocEmail(emailAddress, { switchToEmailTab: true })

              if (result === 'added') {
                toast.success(`Added ${emailAddress} to the list`)
              } else if (result === 'duplicate') {
                toast('Email already in list', { icon: 'ℹ️' })
              } else {
                toast.error('Invalid email address')
              }
            }

            return (
              <article key={getContactKey(contact, index)} className="contact-card">
                <div className="contact-card__header">
                  <div className="contact-card__avatar">{initials}</div>
                  <div>
                    <h3 className="contact-card__name">{contact.Name}</h3>
                    {contact.Title && <p className="contact-card__title">{contact.Title}</p>}
                  </div>
                </div>

                <div className="contact-card__row">
                  <span className="label">Email</span>
                  {emailAddress ? (
                    <a href={`mailto:${emailAddress}`} style={{ whiteSpace: 'nowrap' }}>
                      {emailAddress}
                    </a>
                  ) : (
                    <span>N/A</span>
                  )}
                </div>
                <div className="contact-card__row">
                  <span className="label">Phone</span>
                  <span>{formatPhones(contact.Phone) || 'N/A'}</span>
                </div>

                <div className="contact-card__actions">
                  <button
                    ref={(el) => {
                      if (el) {
                        itemRefs.current[index] = el
                      }
                    }}
                    onClick={handleAddToList}
                    className="btn btn-ghost btn-small"
                    onKeyDown={(e) => handleKeyDown(e, index)}
                    onFocus={() => setActiveIndex(index)}
                    type="button"
                    disabled={!emailAddress}
                  >
                    {emailAddress ? 'Add to Email List' : 'Email Unavailable'}
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <div className="empty-state">No matching contacts.</div>
      )}
    </div>
  )
}

export default memo(ContactSearch)
