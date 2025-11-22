import React, {
  useRef,
  useEffect,
  useCallback,
  memo,
  useState,
  useLayoutEffect,
  useMemo,
} from 'react'
import { VariableSizeList } from 'react-window'
import { normalizeEmail } from '../utils/normalizeEmail'

const DEFAULT_ROW_HEIGHT = 168
const MIN_ROW_HEIGHT = 148
const ROW_GAP = 12
const DEFAULT_HEIGHT = 380
const DEFAULT_WIDTH = 320

// Extracted Row Component to prevent infinite loops and ref churn
const ContactPickerRow = memo(({ index, style, data }) => {
  const {
    contacts,
    activeEmailSet,
    onAddEmail,
    addAdhocEmail,
    updateRowHeight,
    unregisterRow,
  } = data

  const contact = contacts[index]
  const trimmedEmail = contact.email?.trim()
  const normalizedEmail = normalizeEmail(trimmedEmail)
  const isAlreadyAdded = normalizedEmail
    ? activeEmailSet.has(normalizedEmail)
    : false

  // Remove height from style to allow natural content measurement
  // This prevents the infinite loop where we set height -> measure height -> set height + gap -> measure height + gap -> ...
  const { height, width, ...restStyle } = style

  const rowRef = useRef(null)

  useLayoutEffect(() => {
    const node = rowRef.current
    if (!node) {
      unregisterRow(index)
      return
    }

    const measure = () => {
      const measuredHeight = Math.ceil(node.getBoundingClientRect().height)
      // We add ROW_GAP here to the stored size, so react-window reserves space for the gap.
      // But we don't apply it to the element itself (via style.height), so the next measure returns the content height again.
      updateRowHeight(index, (measuredHeight || DEFAULT_ROW_HEIGHT) + ROW_GAP)
    }

    measure()

    const observer = new ResizeObserver(measure)
    observer.observe(node)

    return () => {
      observer.disconnect()
      unregisterRow(index)
    }
  }, [index, updateRowHeight, unregisterRow])

  return (
    <article
      ref={rowRef}
      style={{
        ...restStyle,
        width: width || '100%',
        // Height is intentionally omitted to allow auto-sizing
        boxSizing: 'border-box',
        // We can set position: absolute (from restStyle) but we trust react-window for top/left.
      }}
      className="contact-picker__item"
      role="listitem"
    >
      <div className="contact-picker__identity">
        <div className="contact-picker__avatar">{contact.initials}</div>
        <div>
          <h3 className="contact-picker__name">
            {contact.raw.Name || contact.email || 'Unknown'}
          </h3>
          {contact.raw.Title && (
            <p className="contact-picker__title">{contact.raw.Title}</p>
          )}
        </div>
      </div>
      <div className="contact-picker__details">
        <div>
          <span className="label">Email</span>
          {trimmedEmail ? (
            <a href={`mailto:${trimmedEmail}`} tabIndex={-1}>{trimmedEmail}</a>
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
          onClick={(event) => {
            event.stopPropagation()
            onAddEmail(trimmedEmail)
          }}
          disabled={
            typeof addAdhocEmail !== 'function' || !trimmedEmail || isAlreadyAdded
          }
        >
          {!trimmedEmail
            ? 'Email Unavailable'
            : isAlreadyAdded
              ? 'Already Added'
              : 'Add to List'}
        </button>
      </div>
    </article>
  )
})

/**
 * Virtualized list for the contact picker in EmailGroups.
 */
const VirtualContactList = ({
  contacts,
  activeEmailSet,
  onAddEmail,
  addAdhocEmail
}) => {
  const listRef = useRef(null)
  const listContainerRef = useRef(null)
  const sizeMapRef = useRef(new Map())
  // We don't strictly need rowObserversRef in the parent anymore if the child handles its own observer
  // but we might need it if we want to disconnect all on unmount.
  // The child's cleanup function handles disconnection.

  const [listHeight, setListHeight] = useState(DEFAULT_HEIGHT)
  const [listWidth, setListWidth] = useState(0)

  // Measure available space
  const measure = useCallback(() => {
    const container = listContainerRef.current
    if (!container) return

    const rect = container.getBoundingClientRect()
    const width = rect.width || container.clientWidth || listWidth || DEFAULT_WIDTH
    const height = rect.height || container.clientHeight || listHeight || DEFAULT_HEIGHT

    setListWidth((prev) => (width > 0 ? width : prev || DEFAULT_WIDTH))
    setListHeight((prev) => (height > 0 ? height : prev || DEFAULT_HEIGHT))
  }, [listHeight, listWidth])

  useLayoutEffect(() => {
    measure()
    listRef.current?.resetAfterIndex?.(0, true)
  }, [measure])

  useEffect(() => {
    const container = listContainerRef.current
    if (!container) return

    const updateSize = () => measure()

    updateSize()

    const resizeObserver = new ResizeObserver(updateSize)
    resizeObserver.observe(container)
    return () => resizeObserver.disconnect()
  }, [contacts.length, measure])

  const updateRowHeight = useCallback((index, measuredHeight) => {
    if (typeof measuredHeight !== 'number') return

    const height = Math.max(MIN_ROW_HEIGHT, measuredHeight)
    const current = sizeMapRef.current.get(index)

    if (current === height) return

    sizeMapRef.current.set(index, height)
    listRef.current?.resetAfterIndex?.(index)
  }, [])

  const unregisterRow = useCallback((index) => {
      // No-op now as child handles disconnect, but kept for API compatibility in data prop
  }, [])

  useEffect(() => {
    sizeMapRef.current.clear()
    listRef.current?.resetAfterIndex?.(0, true)
  }, [contacts])

  useEffect(() => {
    sizeMapRef.current.clear()
    listRef.current?.resetAfterIndex?.(0, true)
  }, [listHeight, listWidth])

  const getRowHeight = useCallback(
    (index) => sizeMapRef.current.get(index) || DEFAULT_ROW_HEIGHT + ROW_GAP,
    [],
  )

  const itemData = useMemo(() => ({
      contacts,
      activeEmailSet,
      onAddEmail,
      addAdhocEmail,
      updateRowHeight,
      unregisterRow
  }), [contacts, activeEmailSet, onAddEmail, addAdhocEmail, updateRowHeight, unregisterRow])

  return (
    <div
      style={{
        flex: 1,
        height: '100%',
        minHeight: Math.max(DEFAULT_HEIGHT, DEFAULT_ROW_HEIGHT * 3),
        overflow: 'hidden'
      }}
      ref={listContainerRef}
    >
      <VariableSizeList
        ref={listRef}
        height={listHeight}
        width={Math.max(1, Math.round(listWidth || DEFAULT_WIDTH))}
        itemCount={contacts.length}
        itemSize={getRowHeight}
        itemData={itemData}
      >
        {ContactPickerRow}
      </VariableSizeList>
    </div>
  )
}

export default memo(VirtualContactList)
