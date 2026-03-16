import { ProjectInfo, ServerStatus } from '../App'

interface StatusBarProps {
  message: string
  serverStatus: ServerStatus
  project: ProjectInfo | null
}

export function StatusBar({ message, serverStatus, project }: StatusBarProps): JSX.Element {
  const typeLabel: Record<string, string> = {
    nextjs: 'Next.js',
    'vite-react': 'Vite + React',
    html: 'HTML',
    node: 'Node.js',
    unknown: 'Unknown'
  }

  return (
    <div
      style={{
        height: 28,
        background: '#0c0c0c',
        borderTop: '1px solid #2a2a2a',
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px',
        gap: 12,
        flexShrink: 0,
        overflow: 'hidden'
      }}
    >
      {/* Status message */}
      <span
        style={{
          color: '#888',
          fontSize: 11,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1
        }}
      >
        {message}
      </span>

      {/* Right side info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        {project && (
          <>
            <StatusChip>
              {typeLabel[project.type] || project.type}
            </StatusChip>
            <StatusChip>
              {project.name}
            </StatusChip>
          </>
        )}
        
        {serverStatus.status === 'running' && serverStatus.url && (
          <StatusChip color="#22c55e">
            ● {serverStatus.url}
          </StatusChip>
        )}
        
        <StatusChip>
          ⌘K Capture · ⌘E Export · ⌘R Refresh · ⌘O Open
        </StatusChip>
      </div>
    </div>
  )
}

function StatusChip({
  children,
  color
}: {
  children: React.ReactNode
  color?: string
}): JSX.Element {
  return (
    <span
      style={{
        fontSize: 10,
        color: color || '#555',
        whiteSpace: 'nowrap'
      }}
    >
      {children}
    </span>
  )
}
