import React, {
  useState,
  useMemo,
  useDeferredValue,
  useRef,
  useEffect,
  useLayoutEffect,
  memo,
  useCallback,
  forwardRef,
} from 'react'
import { VariableSizeList } from 'react-window'
import { toast } from 'react-hot-toast'
import { formatPhones } from '../utils/formatPhones'
import { findEmailAddress, getContactInitials } from '../utils/findEmailAddress'

const MIN_COLUMN_WIDTH = 320
const MIN_LIST_HEIGHT = 320
const LIST_BOTTOM_PADDING = 24
const DEFAULT_ROW_HEIGHT = 340

/**
 * Provide a searchable list of contacts with quick email adding.
 * @param {Object} props
 * @param {Array} props.contactData - Parsed contact rows.
 * @param {(email: string, options?: { switchToEmailTab?: boolean }) => 'added' | 'duplicate' | 'invalid'} props.addAdhocEmail -
 * Callback to add emails.
 */
const ContactSearch = ({ contactData, addAdhocEmail }) => {
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const searchInputRef = useRef(null)
  const containerRef = useRef(null)
  const headerRef = useRef(null)
  const listRef = useRef(null)
  const itemRefs = useRef(new Map())
  const sizeMapRef = useRef(new Map())
  const pendingResetIndexRef = useRef(null)
  const scheduledResetRef = useRef(null)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [columnCount, setColumnCount] = useState(1)
  const [listHeight, setListHeight] = useState(MIN_LIST_HEIGHT)
  const [listWidth, setListWidth] = useState(0)

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

  const indexedContacts = useMemo(() => {
    if (!Array.isArray(contactData)) {
      return []
    }

    return contactData.reduce((acc, contact, index) => {
      if (!contact || typeof contact !== 'object') {
        return acc
      }

      const values = Object.values(contact).map((value) =>
        value == null ? '' : String(value),
      )
      const searchText = values.join(' ').toLowerCase()
      const emailAddress = findEmailAddress(contact)

      acc.push({
        raw: contact,
        key: getContactKey(contact, index),
        emailAddress,
        initials: getContactInitials(contact?.Name),
        formattedPhone: formatPhones(contact?.Phone),
        searchText,
      })

      return acc
    }, [])
  }, [contactData, getContactKey])

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase()
    return q ? indexedContacts.filter((contact) => contact.searchText.includes(q)) : indexedContacts
  }, [deferredQuery, indexedContacts])

  useEffect(() => {
    if (activeIndex >= filtered.length) {
      setActiveIndex(filtered.length ? filtered.length - 1 : -1)
    }
  }, [activeIndex, filtered.length])

  useEffect(() => {
    if (activeIndex >= 0) {
      const rowIndex = Math.floor(activeIndex / columnCount)
      listRef.current?.scrollToItem(rowIndex, 'smart')

      const focusButton = () => {
        const btn = itemRefs.current.get(activeIndex)
        btn?.focus()
      }

      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(focusButton)
      } else {
        setTimeout(focusButton, 0)
      }
    }
  }, [activeIndex, columnCount])

  useEffect(() => {
    itemRefs.current = new Map()
    sizeMapRef.current = new Map()
    listRef.current?.resetAfterIndex?.(0, true)
  }, [filtered, columnCount])

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

  useLayoutEffect(() => {
    const container = containerRef.current
    const header = headerRef.current
    if (!container || !header) return

    const updateMetrics = () => {
      container.style.setProperty('--contact-header-height', `${header.offsetHeight}px`)

      const rect = container.getBoundingClientRect()
      const effectiveWidth = rect.width || container.clientWidth || window.innerWidth || 1024
      setListWidth(effectiveWidth)

      const nextColumnCount = Math.max(1, Math.floor(effectiveWidth / MIN_COLUMN_WIDTH))
      setColumnCount(nextColumnCount)

      const availableHeight = Math.max(
        MIN_LIST_HEIGHT,
        window.innerHeight - rect.top - LIST_BOTTOM_PADDING,
      )
      setListHeight(availableHeight)
    }

    updateMetrics()

    let resizeObserver
    const resizeHandler = () => updateMetrics()

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(resizeHandler)
      resizeObserver.observe(container)
    }

    window.addEventListener('resize', resizeHandler)

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect()
      }
      window.removeEventListener('resize', resizeHandler)
    }
  }, [])

  const rows = useMemo(() => {
    if (columnCount <= 1) {
      return filtered.map((contact) => [contact])
    }

    const chunked = []
    for (let i = 0; i < filtered.length; i += columnCount) {
      chunked.push(filtered.slice(i, i + columnCount))
    }
    return chunked
  }, [filtered, columnCount])

  const getRowHeight = useCallback(
    (index) => sizeMapRef.current.get(index) ?? DEFAULT_ROW_HEIGHT,
    [],
  )

  const cancelScheduledReset = useCallback(() => {
    const scheduled = scheduledResetRef.current
    if (!scheduled) {
      return
    }

    scheduledResetRef.current = null

    if (scheduled.type === 'raf') {
      if (typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(scheduled.id)
      }
    } else {
      clearTimeout(scheduled.id)
    }
  }, [])

  const scheduleResetAfterIndex = useCallback((index) => {
    const list = listRef.current
    if (!list?.resetAfterIndex) {
      return
    }

    const pending = pendingResetIndexRef.current
    if (pending == null || index < pending) {
      pendingResetIndexRef.current = index
    }

    if (scheduledResetRef.current) {
      return
    }

    const flush = () => {
      scheduledResetRef.current = null
      const nextIndex = pendingResetIndexRef.current
      pendingResetIndexRef.current = null

      if (nextIndex != null) {
        list.resetAfterIndex(nextIndex)
      }
    }

    if (typeof requestAnimationFrame === 'function') {
      const id = requestAnimationFrame(flush)
      scheduledResetRef.current = { type: 'raf', id }
    } else {
      const id = setTimeout(flush, 0)
      scheduledResetRef.current = { type: 'timeout', id }
    }
  }, [])

  useEffect(() => cancelScheduledReset, [cancelScheduledReset])

  const setRowHeight = useCallback(
    (index, size) => {
      const current = sizeMapRef.current.get(index)
      if (current !== size) {
        sizeMapRef.current.set(index, size)
        scheduleResetAfterIndex(index)
      }
    },
    [scheduleResetAfterIndex],
  )

  const registerRow = useCallback(
    (index, node) => {
      if (!node) {
        return
      }

      const measure = () => {
        const measuredHeight = Math.max(
          node.scrollHeight || 0,
          node.offsetHeight || 0,
          Math.ceil(node.getBoundingClientRect().height || 0),
        )

        const height = measuredHeight > 0 ? Math.max(measuredHeight, DEFAULT_ROW_HEIGHT) : DEFAULT_ROW_HEIGHT
        setRowHeight(index, height)
      }

      measure()

      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(measure)
      } else {
        setTimeout(measure, 0)
      }
    },
    [setRowHeight],
  )

  const setItemRef = useCallback((index, node) => {
    if (node) {
      itemRefs.current.set(index, node)
    } else {
      itemRefs.current.delete(index)
    }
  }, [])

  const ContactListOuter = useMemo(
    () =>
      forwardRef(function ContactListOuterComponent({ style, ...rest }, ref) {
        return (
          <div
            ref={ref}
            style={{
              ...style,
              paddingTop: 'var(--contact-header-height)',
              marginTop: 'calc(-1 * var(--contact-header-height))',
              outline: 'none',
            }}
            className="contact-list-scroll minimal-scrollbar"
            role="list"
            aria-label="Contact results"
            {...rest}
          />
        )
      }),
    [],
  )

  return (
    <div className="contact-search" ref={containerRef}>
      <div className="sticky-header" ref={headerRef}>
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
        listWidth > 0 && (
          <VariableSizeList
            ref={listRef}
            height={listHeight}
            width={listWidth}
            itemCount={rows.length}
            itemSize={getRowHeight}
            outerElementType={ContactListOuter}
          >
            {({ index, style }) => {
              const row = rows[index]
              return (
                <div
                  style={{ ...style, width: listWidth, '--contact-columns': columnCount }}
                  className="contact-list__row"
                  ref={(node) => registerRow(index, node)}
                  data-row-index={index}
                >
                  {row.map((contact, columnIndex) => {
                    const globalIndex = index * columnCount + columnIndex
                    const { raw, emailAddress, initials, formattedPhone, key } = contact
                    const displayName = raw?.Name || emailAddress || 'Unknown'

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
                      <div className="contact-card-wrapper" key={key}>
                        <article className="contact-card" role="listitem">
                          <div className="contact-card__header">
                            <div className="contact-card__avatar">{initials}</div>
                            <div>
                              <h3 className="contact-card__name">{displayName}</h3>
                              {raw?.Title && <p className="contact-card__title">{raw.Title}</p>}
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
                            <span>{formattedPhone || 'N/A'}</span>
                          </div>

                          <div className="contact-card__actions">
                            <button
                              ref={(node) => setItemRef(globalIndex, node)}
                              onClick={handleAddToList}
                              className="btn btn-outline btn-small"
                              onKeyDown={(e) => handleKeyDown(e, globalIndex)}
                              onFocus={() => setActiveIndex(globalIndex)}
                              type="button"
                              disabled={!emailAddress}
                              data-active={activeIndex === globalIndex ? 'true' : undefined}
                            >
                              {emailAddress ? 'Add to Email List' : 'Email Unavailable'}
                            </button>
                          </div>
                        </article>
                      </div>
                    )
                  })}
                </div>
              )
            }}
          </VariableSizeList>
        )
      ) : (
        <div className="empty-state">No matching contacts.</div>
      )}
    </div>
  )
}

export default memo(ContactSearch)
