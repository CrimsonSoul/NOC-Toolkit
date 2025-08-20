import React from 'react'

/**
 * Renders the Email/Contact tab selector.
 * @param {Object} props
 * @param {'email'|'contact'|'radar'} props.tab - Currently active tab.
 * @param {(tab: string) => void} props.setTab - Update active tab.
 */
const TabSelector = ({ tab, setTab }) => (
  <div className="stack-on-small tab-selector">
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

export default TabSelector
