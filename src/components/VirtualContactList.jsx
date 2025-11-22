import React, {
  useRef,
  useEffect,
  useCallback,
  memo,
  useState,
  useLayoutEffect,
} from 'react'
import { VariableSizeList } from 'react-window'
import { normalizeEmail } from '../utils/normalizeEmail'

const ROW_HEIGHT = 80 // Fixed height for simpler picker rows
const DEFAULT_HEIGHT = 380
const DEFAULT_WIDTH = 320

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

  const ContactPickerRow = useCallback(({ index, style }) => {
    const contact = contacts[index]
    const trimmedEmail = contact.email?.trim()
    const normalizedEmail = normalizeEmail(trimmedEmail)
    const isAlreadyAdded = normalizedEmail
      ? activeEmailSet.has(normalizedEmail)
      : false

    return (
      <article style={style} className="contact-picker__item" role="listitem">
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
            onClick={() => onAddEmail(trimmedEmail)}
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
  }, [contacts, activeEmailSet, onAddEmail, addAdhocEmail])

  return (
    <div
      style={{ flex: 1, height: '100%', minHeight: DEFAULT_HEIGHT, overflow: 'hidden' }}
      ref={listContainerRef}
    >
      <VariableSizeList
        ref={listRef}
        height={listHeight}
        width={Math.max(1, Math.round(listWidth || DEFAULT_WIDTH))}
        itemCount={contacts.length}
        itemSize={() => ROW_HEIGHT}
      >
        {ContactPickerRow}
      </VariableSizeList>
    </div>
  )
}

export default memo(VirtualContactList)
