import { useEffect, useRef, useState } from 'react'
import { ProjectInfo, ServerStatus } from '../App'

interface WebviewPanelProps {
  previewUrl: string | null
  project: ProjectInfo | null
  serverStatus: ServerStatus
  isCapturing: boolean
}

export function WebviewPanel({ previewUrl, project, serverStatus, isCapturing }: WebviewPanelProps): JSX.Element {
  const webviewRef = useRef<Electron.WebviewTag>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [showFlash, setShowFlash] = useState(false)
  const [currentUrl, setCurrentUrl] = useState<string | null>(null)

  // Load URL when it changes
  useEffect(() => {
    if (previewUrl && webviewRef.current) {
      setIsLoading(true)
      setCurrentUrl(previewUrl)
    }
  }, [previewUrl])

  // Handle webview events
  useEffect(() => {
    const webview = webviewRef.current
    if (!webview) return

    const handleStartLoad = (): void => setIsLoading(true)
    const handleStopLoad = (): void => setIsLoading(false)
    const handleFailLoad = (): void => setIsLoading(false)

    webview.addEventListener('did-start-loading', handleStartLoad)
    webview.addEventListener('did-stop-loading', handleStopLoad)
    webview.addEventListener('did-fail-load', handleFailLoad)

    return () => {
      webview.removeEventListener('did-start-loading', handleStartLoad)
      webview.removeEventListener('did-stop-loading', handleStopLoad)
      webview.removeEventListener('did-fail-load', handleFailLoad)
    }
  }, [])

  // File change → reload
  useEffect(() => {
    window.api.onFileChanged(() => {
      if (webviewRef.current && currentUrl) {
        setTimeout(() => {
          webviewRef.current?.reload()
        }, 500)
      }
    })
  }, [currentUrl])

  // Flash animation on capture
  useEffect(() => {
    if (isCapturing) {
      setShowFlash(true)
      setTimeout(() => setShowFlash(false), 300)
    }
  }, [isCapturing])

  const showSkeleton = serverStatus.status === 'starting' || (project && !previewUrl)
  const showEmpty = !project

  return (
    <div
      style={{
        width: '42%',
        height: '100%',
        background: '#161616',
        borderRight: '1px solid #2a2a2a',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      {/* Panel header */}
      <div
        style={{
          height: 36,
          background: '#0c0c0c',
          borderBottom: '1px solid #2a2a2a',
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
          gap: 8,
          flexShrink: 0
        }}
      >
        <span style={{ color: '#555', fontSize: 11 }}>PREVIEW</span>
        {isLoading && (
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              border: '1.5px solid #6366f1',
              borderTopColor: 'transparent',
              animation: 'spin 0.8s linear infinite'
            }}
          />
        )}
        {currentUrl && (
          <span
            style={{
              color: '#555',
              fontSize: 10,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
              marginLeft: 4
            }}
          >
            {currentUrl}
          </span>
        )}
      </div>

      {/* Content area */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {/* Empty state */}
        {showEmpty && (
          <EmptyState onSelectProject={() => window.api.selectProject()} />
        )}

        {/* Skeleton loading */}
        {showSkeleton && !showEmpty && (
          <SkeletonLoader status={serverStatus.status} />
        )}

        {/* Webview */}
        {currentUrl && (
          <webview
            ref={webviewRef}
            src={currentUrl}
            style={{
              width: '100%',
              height: '100%',
              display: 'block',
              opacity: isLoading ? 0.3 : 1,
              transition: 'opacity 300ms ease'
            }}
          />
        )}

        {/* Flash overlay */}
        {showFlash && (
          <div
            className="flash-overlay"
            style={{
              position: 'absolute',
              inset: 0,
              background: 'white',
              pointerEvents: 'none',
              zIndex: 10
            }}
          />
        )}
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

function EmptyState({ onSelectProject }: { onSelectProject: () => void }): JSX.Element {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: 32
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          background: '#1e1e1e',
          borderRadius: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 28
        }}
      >
        📂
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ color: '#f5f5f5', fontSize: 15, fontWeight: 500, marginBottom: 6 }}>
          No project selected
        </div>
        <div style={{ color: '#555', fontSize: 12, lineHeight: 1.6 }}>
          Select a project directory to preview<br />
          your app and start annotating
        </div>
      </div>
      <button
        onClick={onSelectProject}
        style={{
          background: '#6366f1',
          border: 'none',
          borderRadius: 8,
          padding: '8px 20px',
          color: '#fff',
          cursor: 'pointer',
          fontSize: 13,
          fontWeight: 500,
          marginTop: 4
        }}
      >
        Select Project (⌘O)
      </button>
    </div>
  )
}

function SkeletonLoader({ status }: { status: string }): JSX.Element {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: 8 }}>
        <span style={{ color: '#888', fontSize: 12 }}>
          {status === 'starting' ? '🚀 Starting dev server...' : 'Loading...'}
        </span>
      </div>
      {/* Skeleton blocks */}
      <div className="skeleton" style={{ height: 48, borderRadius: 8 }} />
      <div className="skeleton" style={{ height: 200, borderRadius: 8 }} />
      <div style={{ display: 'flex', gap: 12 }}>
        <div className="skeleton" style={{ flex: 1, height: 80, borderRadius: 8 }} />
        <div className="skeleton" style={{ flex: 1, height: 80, borderRadius: 8 }} />
        <div className="skeleton" style={{ flex: 1, height: 80, borderRadius: 8 }} />
      </div>
      <div className="skeleton" style={{ height: 120, borderRadius: 8 }} />
      <div className="skeleton" style={{ height: 48, borderRadius: 8 }} />
    </div>
  )
}
