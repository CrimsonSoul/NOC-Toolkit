import React from 'react'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error', error, errorInfo)
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <div className="module-card">
            <h2>Something went wrong</h2>
            <p>An unexpected error occurred in the application interface.</p>
            {this.state.error && (
              <pre className="error-details">{this.state.error.toString()}</pre>
            )}
            <button onClick={this.handleReload} className="btn btn-primary">
              Reload Application
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
