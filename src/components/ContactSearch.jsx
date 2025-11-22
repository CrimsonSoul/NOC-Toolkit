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
import { normalizeSearchText } from '../utils/normalizeText'
import { notifyAdhocEmailResult } from '../utils/notifyAdhocEmailResult'
import { buildIndexedContacts } from '../utils/contactIndex'

const MIN_COLUMN_WIDTH = 260
const MIN_LIST_HEIGHT = 320
const LIST_BOTTOM_PADDING = 24
const DEFAULT_ROW_HEIGHT = 260
const MIN_ROW_HEIGHT = 210
const DEFAULT_COLUMN_GAP = 20

const parsePxValue = (value) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }

  if (typeof value !== 'string') {
    return 0
  }

  const parsed = parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

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
  const listSurfaceRef = useRef(null)
  const headerRef = useRef(null)
  const listRef = useRef(null)
  const itemRefs = useRef(new Map())
  const sizeMapRef = useRef(new Map())
  const rowsRef = useRef([])
  const rowObserversRef = useRef(new Map())
  const pendingResetIndexRef = useRef(null)
  const scheduledResetRef = useRef(null)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [columnCount, setColumnCount] = useState(1)
  const [listHeight, setListHeight] = useState(MIN_LIST_HEIGHT)
  const [listWidth, setListWidth] = useState(0)
  const rowGapRef = useRef(DEFAULT_COLUMN_GAP)
  const availableHeightRef = useRef(MIN_LIST_HEIGHT)
  const totalMeasuredHeightRef = useRef(0)

  const indexedContacts = useMemo(
    () => buildIndexedContacts(contactData),
    [contactData],
  )

  const normalizedQuery = useMemo(
    () => normalizeSearchText(deferredQuery),
    [deferredQuery],
  )

  const filtered = useMemo(() => {
    return normalizedQuery
      ? indexedContacts.filter((contact) => contact.searchText.includes(normalizedQuery))
      : indexedContacts
  }, [indexedContacts, normalizedQuery])

  const isSearching = Boolean(normalizedQuery)

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

  const applyListHeight = useCallback((height) => {
    const available = availableHeightRef.current || MIN_LIST_HEIGHT
    const clamped = Math.max(
      MIN_LIST_HEIGHT,
      Math.min(available, height),
    )

    setListHeight((prev) => (Math.abs(prev - clamped) < 0.5 ? prev : clamped))
  }, [])

  const updateListHeightEstimate = useCallback(() => {
    const rowCount = rowsRef.current.length

    if (rowCount === 0) {
      applyListHeight(MIN_LIST_HEIGHT)
      return
    }

    const measuredTotal = totalMeasuredHeightRef.current || 0
    const measuredCount = sizeMapRef.current.size
    const remainingCount = Math.max(0, rowCount - measuredCount)
    const estimatedTotal = measuredTotal + remainingCount * DEFAULT_ROW_HEIGHT

    applyListHeight(estimatedTotal)
  }, [applyListHeight])

  const updateLayoutMetrics = useCallback(() => {
    const container = containerRef.current
    const header = headerRef.current

    if (!container || !header) {
      return
    }

    container.style.setProperty('--contact-header-height', `${header.offsetHeight}px`)

    const measurementTarget = listSurfaceRef.current || container
    const rect = measurementTarget.getBoundingClientRect()
    let widthValue =
      rect.width ||
      measurementTarget.clientWidth ||
      container.clientWidth ||
      window.innerWidth ||
      1024

    if (measurementTarget === listSurfaceRef.current) {
      const styles = window.getComputedStyle(measurementTarget)
      const paddingLeft = parsePxValue(styles.paddingLeft)
      const paddingRight = parsePxValue(styles.paddingRight)
      widthValue -= paddingLeft + paddingRight
    }

    const effectiveWidth = Math.max(widthValue, 0)

    if (effectiveWidth > 0) {
      setListWidth((prev) => (Math.abs(prev - effectiveWidth) < 0.5 ? prev : effectiveWidth))
    }

    const gap = rowGapRef.current || 0
    const nextColumnCount = Math.max(
      1,
      Math.floor((effectiveWidth + gap) / (MIN_COLUMN_WIDTH + gap)),
    )
    setColumnCount((prev) => (prev === nextColumnCount ? prev : nextColumnCount))

    let bottomPadding = LIST_BOTTOM_PADDING
    let bottomLimit = window.innerHeight

    const moduleCard = container.closest('.module-card')
    if (moduleCard) {
      const moduleRect = moduleCard.getBoundingClientRect()
      bottomLimit = Math.min(bottomLimit, moduleRect.bottom)

      const moduleStyles = window.getComputedStyle(moduleCard)
      const paddingBottom = parsePxValue(moduleStyles.paddingBottom)
      const borderBottom = parsePxValue(moduleStyles.borderBottomWidth)
      bottomPadding = Math.max(bottomPadding, paddingBottom + borderBottom)
    }

    const availableHeight = Math.max(
      MIN_LIST_HEIGHT,
      Math.floor(bottomLimit - rect.top - bottomPadding),
    )

    availableHeightRef.current = availableHeight
    updateListHeightEstimate()
  }, [updateListHeightEstimate])

  useLayoutEffect(() => {
    const container = containerRef.current
    const header = headerRef.current
    if (!container || !header) return

    updateLayoutMetrics()

    let resizeObserver
    let surfaceObserver
    const resizeHandler = () => updateLayoutMetrics()

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(resizeHandler)
      resizeObserver.observe(container)

      if (listSurfaceRef.current) {
        surfaceObserver = new ResizeObserver(resizeHandler)
        surfaceObserver.observe(listSurfaceRef.current)
      }
    }

    window.addEventListener('resize', resizeHandler)

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect()
      }
      if (surfaceObserver) {
        surfaceObserver.disconnect()
      }
      window.removeEventListener('resize', resizeHandler)
    }
  }, [updateLayoutMetrics])

  useEffect(() => {
    updateLayoutMetrics()
  }, [normalizedQuery, filtered.length, updateLayoutMetrics])

  useEffect(() => {
    itemRefs.current = new Map()
    sizeMapRef.current = new Map()
    totalMeasuredHeightRef.current = 0
    rowObserversRef.current.forEach((observer) => observer.disconnect())
    rowObserversRef.current.clear()
    listRef.current?.resetAfterIndex?.(0, true)
    updateListHeightEstimate()
  }, [filtered, columnCount, updateListHeightEstimate])

  const rows = useMemo(() => {
    // If column count is 0 or negative, default to 1 to avoid infinite loops or crashes
    const safeColumns = Math.max(1, columnCount);
    if (safeColumns <= 1) {
      return filtered.map((contact) => [contact])
    }

    const chunked = []
    for (let i = 0; i < filtered.length; i += safeColumns) {
      chunked.push(filtered.slice(i, i + safeColumns))
    }
    return chunked
  }, [filtered, columnCount])

  useEffect(() => {
    rowsRef.current = rows
    updateListHeightEstimate()
  }, [rows, updateListHeightEstimate])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const firstRow = container.querySelector('.contact-list__row')
    if (!firstRow) {
      return
    }

    const styles = window.getComputedStyle(firstRow)
    const columnGap =
      parsePxValue(styles.columnGap) ||
      parsePxValue(styles.gap) ||
      parsePxValue(styles.gridColumnGap)

    if (columnGap && Math.abs(columnGap - rowGapRef.current) > 0.5) {
      rowGapRef.current = columnGap
      updateLayoutMetrics()
    }
  }, [rows, updateLayoutMetrics])

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
        if (typeof current === 'number') {
          totalMeasuredHeightRef.current += size - current
        } else {
          totalMeasuredHeightRef.current += size
        }
        scheduleResetAfterIndex(index)
        updateListHeightEstimate()
      }
    },
    [scheduleResetAfterIndex, updateListHeightEstimate],
  )

  useEffect(() => () => {
    rowObserversRef.current.forEach((observer) => observer.disconnect())
    rowObserversRef.current.clear()
  }, [])

  const disconnectRowObserver = useCallback((index) => {
    const existingObserver = rowObserversRef.current.get(index)
    if (existingObserver) {
      existingObserver.disconnect()
      rowObserversRef.current.delete(index)
    }
  }, [])

  const registerRow = useCallback(
    (index, node) => {
      if (!node) {
        disconnectRowObserver(index)
        return
      }

      disconnectRowObserver(index)

      const measure = () => {
        const measuredHeight = Math.max(
          node.scrollHeight || 0,
          node.offsetHeight || 0,
          Math.ceil(node.getBoundingClientRect().height || 0),
        )

        const height =
          measuredHeight > 0 ? Math.max(measuredHeight, MIN_ROW_HEIGHT) : DEFAULT_ROW_HEIGHT
        setRowHeight(index, height)
      }

      measure()

      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(measure)
      } else {
        setTimeout(measure, 0)
      }

      if (typeof ResizeObserver !== 'undefined') {
        const observer = new ResizeObserver(() => {
          measure()
        })
        observer.observe(node)
        rowObserversRef.current.set(index, observer)
      }
    },
    [disconnectRowObserver, setRowHeight],
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
              paddingTop:
                'calc(var(--contact-header-height) + var(--contact-list-offset))',
              scrollPaddingTop:
                'calc(var(--contact-header-height) + var(--contact-list-offset))',
              marginTop: 0,
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

  const handleOpenContactsExcel = useCallback(async () => {
    if (!window?.nocListAPI?.openFile) {
      toast.error('Desktop bridge unavailable: cannot open Excel file')
      return
    }

    try {
      const didOpen = await window.nocListAPI.openFile('contacts.xlsx')
      if (!didOpen) {
        toast.error('Unable to open contacts.xlsx')
      }
    } catch (error) {
      console.error('Failed to open contacts.xlsx:', error)
      toast.error('Unable to open contacts.xlsx')
    }
  }, [])

  return (
    <div className="contact-search" ref={containerRef}>
      <div className="sticky-header" ref={headerRef}>
        <div className="stack-on-small align-center gap-0-5 mb-1">
          <button
            onClick={handleOpenContactsExcel}
            className="btn btn-secondary"
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

      <div className="contact-search__surface list-surface minimal-scrollbar" ref={listSurfaceRef}>
        {filtered.length > 0 ? (
          <VariableSizeList
            ref={listRef}
            height={listHeight}
            width={Math.max(1, Math.round(listWidth || listSurfaceRef.current?.clientWidth || 320))}
            itemCount={rows.length}
            itemSize={getRowHeight}
            outerElementType={ContactListOuter}
          >
            {({ index, style }) => {
              const row = rows[index]
              return (
                <div
                  style={{
                    ...style,
                    width: '100%',
                    maxWidth: '100%',
                    '--contact-columns': columnCount,
                  }}
                  className="contact-list__row"
                  ref={(node) => registerRow(index, node)}
                  data-row-index={index}
                >
                  {row.map((contact, columnIndex) => {
                    const globalIndex = index * columnCount + columnIndex
                    const { raw, email, initials, formattedPhone, key } = contact
                    const displayName = raw?.Name || email || 'Unknown'

                    const handleAddToList = () => {
                      if (!email) {
                        toast.error('No email address available for this contact')
                        return
                      }

                      if (typeof addAdhocEmail !== 'function') {
                        toast.error('Adding emails is currently unavailable')
                        return
                      }

                      const result = addAdhocEmail(email, { switchToEmailTab: true })
                      notifyAdhocEmailResult(email, result)
                    }

                    return (
                      <div className="contact-card-wrapper" key={key}>
                        <article className="contact-card" role="listitem">
                          <div className="contact-card__header">
                            <div className="contact-card__avatar">{initials}</div>
                            <div style={{ minWidth: 0 }}>
                              <h3 className="contact-card__name" title={displayName}>{displayName}</h3>
                              {raw?.Title && <p className="contact-card__title" title={raw.Title}>{raw.Title}</p>}
                            </div>
                          </div>

                          <div className="contact-card__body">
                            <div className="contact-card__row">
                              <span className="label">Email</span>
                              {email ? (
                                <a href={`mailto:${email}`} title={email}>
                                  {email}
                                </a>
                              ) : (
                                <span>N/A</span>
                              )}
                            </div>
                            <div className="contact-card__row">
                              <span className="label">Phone</span>
                              <span>{formattedPhone || 'N/A'}</span>
                            </div>
                          </div>

                          <div className="contact-card__actions">
                            <button
                              ref={(node) => setItemRef(globalIndex, node)}
                              onClick={handleAddToList}
                              className="btn btn-outline btn-small"
                              onKeyDown={(e) => handleKeyDown(e, globalIndex)}
                              onFocus={() => setActiveIndex(globalIndex)}
                              type="button"
                              disabled={typeof addAdhocEmail !== 'function' || !email}
                              data-active={activeIndex === globalIndex ? 'true' : undefined}
                            >
                              {email ? 'Add to Email List' : 'Email Unavailable'}
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
        ) : (
          <div className="empty-state">
            {isSearching ? 'No contacts match your search.' : 'No contacts available.'}
          </div>
        )}
      </div>
    </div>
  )
}

export default memo(ContactSearch)
