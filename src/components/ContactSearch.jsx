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
import { FixedSizeList as List } from 'react-window'
import { formatPhones } from '../utils/formatPhones'

/**
 * Provide a searchable list of contacts with quick email adding.
 * @param {Object} props
 * @param {Array} props.contactData - Parsed contact rows.
 * @param {(email: string, options?: { switchToEmailTab?: boolean }) => boolean} props.addAdhocEmail - Callback to add emails.
 */
const ContactSearch = ({ contactData, addAdhocEmail }) => {
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const listRef = useRef(null)
  const listContainerRef = useRef(null)
  const itemRefs = useRef({})
  const [activeIndex, setActiveIndex] = useState(-1)
  const [listHeight, setListHeight] = useState(400)
  const CONTACT_ITEM_HEIGHT = 220
  const MIN_LIST_HEIGHT = CONTACT_ITEM_HEIGHT * 1.2

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

  useEffect(() => {
    if (activeIndex >= 0) {
      const btn = itemRefs.current[activeIndex]
      btn?.focus()
    }
  }, [activeIndex, filtered])

  const updateHeight = useCallback(() => {
    const listElement = listContainerRef.current
    if (!listElement) {
      setListHeight(MIN_LIST_HEIGHT)
      return
    }

    const rootStyles = getComputedStyle(document.documentElement)
    const shellGap = parseFloat(rootStyles.getPropertyValue('--app-shell-gap') || '0')

    const moduleCard = listElement.closest('.module-card')
    const moduleStyles = moduleCard ? getComputedStyle(moduleCard) : null
    const modulePaddingBottom = moduleStyles
      ? parseFloat(moduleStyles.getPropertyValue('padding-bottom') || '0')
      : 0

    const { top } = listElement.getBoundingClientRect()
    const safeSpacing = shellGap + modulePaddingBottom + 24
    const availableHeight = window.innerHeight - top - safeSpacing

    if (Number.isFinite(availableHeight)) {
      setListHeight(Math.max(MIN_LIST_HEIGHT, availableHeight))
    } else {
      setListHeight(MIN_LIST_HEIGHT)
    }
  }, [MIN_LIST_HEIGHT])

  useEffect(() => {
    updateHeight()
    window.addEventListener('resize', updateHeight)
    return () => window.removeEventListener('resize', updateHeight)
  }, [updateHeight])

  const handleNav = useCallback(
    (direction) => {
      setActiveIndex((prev) => {
        const next = direction === 'down' ? prev + 1 : prev - 1
        const clamped = Math.max(0, Math.min(filtered.length - 1, next))
        listRef.current?.scrollToItem(clamped)
        return clamped
      })
    },
    [filtered.length],
  )

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        handleNav('down')
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        handleNav('up')
      }
    },
    [handleNav],
  )

  const renderContact = useCallback(
    ({ index, style }) => {
      const contact = filtered[index]
      if (!contact) return null

      const initials = contact.Name
        ? contact.Name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
        : '?'
      const emailAddress = [
        contact.Email,
        contact.EmailAddress,
        contact['Email Address'],
        contact.email,
        contact['E-mail'],
      ]
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .find(Boolean)

      const handleAddToList = () => {
        if (emailAddress) {
          addAdhocEmail(emailAddress, { switchToEmailTab: true })
        } else {
          toast.error('No email address available for this contact')
        }
      }

      return (
        <div style={{ ...style, padding: '0.5rem 0.5rem' }} className="virtual-row">
          <article className="contact-card">
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
                ref={(el) => (itemRefs.current[index] = el)}
                onClick={handleAddToList}
                className="btn btn-ghost btn-small"
                onKeyDown={handleKeyDown}
                onFocus={() => setActiveIndex(index)}
                type="button"
                disabled={!emailAddress}
              >
                {emailAddress ? 'Add to Email List' : 'Email Unavailable'}
              </button>
            </div>
          </article>
        </div>
      )
    },
    [addAdhocEmail, filtered, handleKeyDown],
  )

  const itemKey = useCallback(
    (index) => {
      const contact = filtered[index]
      return (
        contact?.Email ||
        contact?.EmailAddress ||
        contact?.['Email Address'] ||
        contact?.email ||
        contact?.['E-mail'] ||
        contact?.Name ||
        index
      )
    },
    [filtered],
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
              onChange={e => {
                setQuery(e.target.value)
                setActiveIndex(-1)
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown' && filtered.length) {
                  e.preventDefault()
                  setActiveIndex(0)
                  listRef.current?.scrollToItem(0)
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
        <div ref={listContainerRef} className="contact-list minimal-scrollbar">
          <List
            height={listHeight}
            itemCount={filtered.length}
            itemSize={CONTACT_ITEM_HEIGHT}
            width="100%"
            ref={listRef}
            itemKey={itemKey}
          >
            {renderContact}
          </List>
        </div>
      ) : (
        <div className="empty-state">No matching contacts.</div>
      )}
    </div>
  )
}

export default memo(ContactSearch)
