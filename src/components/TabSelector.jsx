import React, { memo } from 'react'

/**
 * Renders the Email/Contact tab selector.
 * @param {Object} props
 * @param {'email'|'contact'|'radar'} props.tab - Currently active tab.
 * @param {(tab: string) => void} props.setTab - Update active tab.
 */
const TabSelector = ({ tab, setTab }) => (
  <div className="stack-on-small tab-selector" role="tablist" aria-label="Primary tools">
    {['email', 'contact', 'radar'].map((t) => (
      <button
        key={t}
        type="button"
        onClick={() => setTab(t)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setTab(t)
          }
        }}
        className={`tab-button ${tab === t ? 'active' : ''}`}
        role="tab"
        aria-selected={tab === t}
        tabIndex={tab === t ? 0 : -1}
      >
        {t === 'email'
          ? 'Email Groups'
          : t === 'contact'
          ? 'Contact Search'
          : 'Dispatcher Radar'}
      </button>
    ))}
  </div>
)

export default memo(TabSelector)
