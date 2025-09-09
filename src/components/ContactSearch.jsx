import React, {
  useState,
  useMemo,
  useDeferredValue,
  useRef,
  useEffect
} from 'react'
import { FixedSizeList as List } from 'react-window'
import { formatPhones } from '../utils/formatPhones'

/**
 * Provide a searchable list of contacts with quick email adding.
 * @param {Object} props
 * @param {Array} props.contactData - Parsed contact rows.
 * @param {(email: string) => void} props.addAdhocEmail - Callback to add emails.
 */
const ContactSearch = ({ contactData, addAdhocEmail }) => {
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const listRef = useRef(null)
  const itemRefs = useRef({})
  const [activeIndex, setActiveIndex] = useState(-1)
  const [listHeight, setListHeight] = useState(400)

  const indexedContacts = useMemo(
    () =>
      contactData.map((c) => ({
        ...c,
        _search: Object.values(c).join(' ').toLowerCase(),
      })),
    [contactData]
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

  useEffect(() => {
    const updateHeight = () => {
      const maxHeight = window.innerHeight - 220
      setListHeight(Math.max(300, maxHeight))
    }
    updateHeight()
    window.addEventListener('resize', updateHeight)
    return () => window.removeEventListener('resize', updateHeight)
  }, [])

  const handleNav = (direction) => {
    setActiveIndex((prev) => {
      const next = direction === 'down' ? prev + 1 : prev - 1
      const clamped = Math.max(0, Math.min(filtered.length - 1, next))
      listRef.current?.scrollToItem(clamped)
      return clamped
    })
  }

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      handleNav('down')
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      handleNav('up')
    }
  }

  return (
    <div>
      <div className="sticky-header">
        <div className="mb-1">
          <button
            onClick={() => window.nocListAPI?.openFile?.('contacts.xlsx')}
            className="btn btn-secondary open-contact-btn rounded-6"
          >
            Open Contact List Excel
          </button>
        </div>
        <div className="stack-on-small align-center gap-0-5 mb-1">
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
              <button
                onClick={() => setQuery('')}
                className="clear-btn"
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {filtered.length > 0 ? (
        <div style={{ maxWidth: '600px', margin: '0 auto' }} className="contact-list">
          <List
            height={listHeight}
            itemCount={filtered.length}
            itemSize={150}
            width={'100%'}
            ref={listRef}
            className="minimal-scrollbar"
          >
            {({ index, style }) => {
              const contact = filtered[index]
              return (
                <div style={style} key={contact.Email} className="contact-card">
                  <strong>{contact.Name}</strong>
                  <p className="m-0 mt-0-5">
                    <span className="label">Title:</span> {contact.Title}
                  </p>
                  <p className="m-0">
                    <span className="label">Email:</span>{' '}
                    <a
                      href={`mailto:${contact.Email}`}
                      style={{ whiteSpace: 'nowrap' }}
                    >
                      {contact.Email}
                    </a>
                  </p>
                  <p className="m-0">
                    <span className="label">Phone:</span> {formatPhones(contact.Phone)}
                  </p>
                  <button
                    ref={(el) => (itemRefs.current[index] = el)}
                    onClick={() => addAdhocEmail(contact.Email)}
                    className="btn btn-small rounded-6 mt-0-5"
                    onKeyDown={handleKeyDown}
                    onFocus={() => setActiveIndex(index)}
                  >
                    Add to Email List
                  </button>
                </div>
              )
            }}
          </List>
        </div>
      ) : (
        <p className="text-muted">No matching contacts.</p>
      )}
    </div>
  )
}

export default ContactSearch
