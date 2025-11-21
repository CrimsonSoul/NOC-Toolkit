import React from 'react'
import { toast } from 'react-hot-toast'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('Uncaught error in UI:', error, errorInfo)
    // In a real production app, you'd send this to a logging service (e.g., Sentry)
    // or use the electron-log IPC bridge if exposed.
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="app-shell" style={{ alignItems: 'center', justifyContent: 'center' }}>
          <div className="module-card text-center" style={{ maxWidth: '500px', padding: '2rem' }}>
            <h2>Something went wrong</h2>
            <p className="text-muted">
              The application encountered an unexpected error.
            </p>
            <div className="button-group" style={{ justifyContent: 'center', marginTop: '1rem' }}>
              <button
                className="btn btn-accent"
                onClick={() => {
                  this.setState({ hasError: false })
                  window.location.reload()
                }}
              >
                Reload Application
              </button>
            </div>
            {this.state.error && (
                <pre style={{
                    marginTop: '1.5rem',
                    padding: '1rem',
                    background: 'rgba(0,0,0,0.3)',
                    borderRadius: '4px',
                    textAlign: 'left',
                    overflow: 'auto',
                    maxHeight: '200px',
                    fontSize: '0.85rem',
                    color: 'var(--text-muted)'
                }}>
                    {this.state.error.toString()}
                </pre>
            )}
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
