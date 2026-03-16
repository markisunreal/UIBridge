import { useState } from 'react'
import { ProjectInfo, ServerStatus } from '../App'

interface ToolbarProps {
  project: ProjectInfo | null
  serverStatus: ServerStatus
  onSelectProject: () => void
  onCapture: () => void
  onExport: () => void
  onRefresh: () => void
  isCapturing: boolean
}

export function Toolbar({
  project,
  serverStatus,
  onSelectProject,
  onCapture,
  onExport,
  onRefresh,
  isCapturing
}: ToolbarProps): JSX.Element {
  const [showRecent, setShowRecent] = useState(false)
  const [recentProjects, setRecentProjects] = useState<string[]>([])

  const handleShowRecent = async (): Promise<void> => {
    const recent = await window.api.getRecentProjects()
    setRecentProjects(recent)
    setShowRecent(true)
  }

  const handleOpenRecent = async (path: string): Promise<void> => {
    setShowRecent(false)
    await window.api.openRecentProject(path)
  }

  const serverDot = {
    idle: '#555',
    starting: '#f59e0b',
    running: '#22c55e',
    stopped: '#ef4444',
    timeout: '#ef4444'
  }[serverStatus.status]

  return (
    <div
      style={{
        height: 48,
        background: '#161616',
        borderBottom: '1px solid #2a2a2a',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: 8,
        WebkitAppRegion: 'drag' as React.CSSProperties['WebkitAppRegion'],
        userSelect: 'none',
        flexShrink: 0
      }}
    >
      {/* Traffic light spacer for macOS */}
      <div style={{ width: 72 }} />

      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 8 }}>
        <div
          style={{
            width: 24,
            height: 24,
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 700,
            color: '#fff'
          }}
        >
          U
        </div>
        <span style={{ fontWeight: 600, fontSize: 14, color: '#f5f5f5' }}>UIBridge</span>
      </div>

      <div
        style={{
          width: 1,
          height: 20,
          background: '#2a2a2a',
          margin: '0 4px'
        }}
      />

      {/* Project selector */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          WebkitAppRegion: 'no-drag' as React.CSSProperties['WebkitAppRegion']
        }}
      >
        <button
          onClick={onSelectProject}
          style={{
            background: project ? '#1e1e1e' : '#6366f1',
            border: '1px solid',
            borderColor: project ? '#2a2a2a' : '#6366f1',
            borderRadius: 6,
            padding: '4px 10px',
            color: '#f5f5f5',
            cursor: 'pointer',
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            transition: 'all 150ms ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = project ? '#252525' : '#4f52d9'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = project ? '#1e1e1e' : '#6366f1'
          }}
        >
          <span>📁</span>
          {project ? (
            <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {project.name}
            </span>
          ) : (
            '选择项目'
          )}
        </button>

        {/* Recent projects button */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={handleShowRecent}
            style={{
              background: '#1e1e1e',
              border: '1px solid #2a2a2a',
              borderRadius: 6,
              padding: '4px 8px',
              color: '#888',
              cursor: 'pointer',
              fontSize: 11,
              transition: 'all 150ms ease'
            }}
            title="Recent projects"
          >
            ▾
          </button>

          {showRecent && (
            <>
              <div
                style={{
                  position: 'fixed',
                  inset: 0,
                  zIndex: 99
                }}
                onClick={() => setShowRecent(false)}
              />
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: 4,
                  background: '#1e1e1e',
                  border: '1px solid #2a2a2a',
                  borderRadius: 8,
                  padding: 4,
                  minWidth: 240,
                  zIndex: 100,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.5)'
                }}
              >
                {recentProjects.length === 0 ? (
                  <div style={{ padding: '8px 12px', color: '#555', fontSize: 12 }}>
                    No recent projects
                  </div>
                ) : (
                  recentProjects.map((p) => (
                    <button
                      key={p}
                      onClick={() => handleOpenRecent(p)}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        background: 'none',
                        border: 'none',
                        padding: '6px 12px',
                        color: '#f5f5f5',
                        cursor: 'pointer',
                        fontSize: 12,
                        borderRadius: 4,
                        transition: 'background 150ms ease',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#2a2a2a'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'none'
                      }}
                    >
                      {p.split('/').pop()} <span style={{ color: '#555', fontSize: 11 }}>{p}</span>
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Server status indicator */}
      {project && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '3px 8px',
            background: '#1e1e1e',
            border: '1px solid #2a2a2a',
            borderRadius: 6,
            WebkitAppRegion: 'no-drag' as React.CSSProperties['WebkitAppRegion']
          }}
        >
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: serverDot,
              boxShadow: serverStatus.status === 'running' ? `0 0 6px ${serverDot}` : 'none'
            }}
          />
          <span style={{ fontSize: 11, color: '#888' }}>
            {serverStatus.status === 'running'
              ? `:${serverStatus.port}`
              : serverStatus.status === 'starting'
              ? 'Starting...'
              : serverStatus.status}
          </span>
        </div>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Action buttons */}
      <div
        style={{
          display: 'flex',
          gap: 6,
          WebkitAppRegion: 'no-drag' as React.CSSProperties['WebkitAppRegion']
        }}
      >
        <ToolButton onClick={onRefresh} title="Refresh (⌘R)" disabled={!previewUrlExists()}>
          ↺
        </ToolButton>
        <ToolButton
          onClick={onCapture}
          title="Capture to canvas (⌘K)"
          disabled={isCapturing}
          primary
        >
          {isCapturing ? '...' : '📷 Capture'}
        </ToolButton>
        <ToolButton onClick={onExport} title="Export notes (⌘E)" accent>
          ✦ Export
        </ToolButton>
      </div>
    </div>
  )

  function previewUrlExists(): boolean {
    return serverStatus.status === 'running'
  }
}

interface ToolButtonProps {
  onClick: () => void
  title?: string
  disabled?: boolean
  primary?: boolean
  accent?: boolean
  children: React.ReactNode
}

function ToolButton({ onClick, title, disabled, primary, accent, children }: ToolButtonProps): JSX.Element {
  const bg = primary ? '#6366f1' : accent ? '#1e1e1e' : '#1e1e1e'
  const hoverBg = primary ? '#4f52d9' : accent ? '#2a2a2a' : '#2a2a2a'
  const border = primary ? '#6366f1' : accent ? '#6366f1' : '#2a2a2a'
  const color = disabled ? '#555' : primary || accent ? '#f5f5f5' : '#888'

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        background: disabled ? '#161616' : bg,
        border: `1px solid ${disabled ? '#2a2a2a' : border}`,
        borderRadius: 6,
        padding: '4px 10px',
        color,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 12,
        transition: 'all 150ms ease',
        display: 'flex',
        alignItems: 'center',
        gap: 4
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.background = hoverBg
      }}
      onMouseLeave={(e) => {
        if (!disabled) e.currentTarget.style.background = bg
      }}
    >
      {children}
    </button>
  )
}
