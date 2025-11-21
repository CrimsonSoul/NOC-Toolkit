import React, {
  useMemo,
  useRef,
  useEffect,
  useCallback,
  forwardRef,
  memo,
  useState
} from 'react'
import { VariableSizeList } from 'react-window'
import { normalizeEmail } from '../utils/normalizeEmail'

const ROW_HEIGHT = 80 // Fixed height for simpler picker rows

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
  const [listHeight, setListHeight] = useState(400)
  const [listWidth, setListWidth] = useState(0)

  // Measure available space
  useEffect(() => {
    const container = listContainerRef.current
    if (!container) return

    const updateSize = () => {
      const { width, height } = container.getBoundingClientRect()
      setListWidth(width)
      setListHeight(height)
    }

    updateSize()

    const resizeObserver = new ResizeObserver(updateSize)
    resizeObserver.observe(container)
    return () => resizeObserver.disconnect()
  }, [])

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
    <div style={{ flex: 1, height: '100%', overflow: 'hidden' }} ref={listContainerRef}>
      {listWidth > 0 && (
        <VariableSizeList
          ref={listRef}
          height={listHeight}
          width={listWidth}
          itemCount={contacts.length}
          itemSize={() => ROW_HEIGHT}
        >
          {ContactPickerRow}
        </VariableSizeList>
      )}
    </div>
  )
}

export default memo(VirtualContactList)
