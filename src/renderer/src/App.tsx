import { useState, useEffect, useRef, useCallback } from 'react'
import { Tldraw, createTLStore, getSnapshot, loadSnapshot, TLShapeId, createShapeId } from 'tldraw'
import 'tldraw/tldraw.css'

interface ProjectInfo {
  path: string
  type: string
  name: string
}

interface ServerStatus {
  status: 'idle' | 'starting' | 'running' | 'stopped' | 'timeout'
  port?: number
  url?: string
}

const STATUS_COLOR: Record<string, string> = {
  idle: '#555',
  starting: '#f59e0b',
  running: '#22c55e',
  stopped: '#ef4444',
  timeout: '#ef4444'
}

const STATUS_LABEL: Record<string, string> = {
  idle: '未启动',
  starting: '启动中...',
  running: '运行中',
  stopped: '已停止',
  timeout: '超时'
}

export default function App(): JSX.Element {
  const [project, setProject] = useState<ProjectInfo | null>(null)
  const [serverStatus, setServerStatus] = useState<ServerStatus>({ status: 'idle' })
  const [recentProjects, setRecentProjects] = useState<string[]>([])
  const [webviewUrl, setWebviewUrl] = useState<string | null>(null)
  const [isWebviewLoading, setIsWebviewLoading] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [exportContent, setExportContent] = useState('')
  const [flashActive, setFlashActive] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')

  const webviewRef = useRef<Electron.WebviewTag | null>(null)
  const storeRef = useRef(createTLStore())
  const editorRef = useRef<any>(null)

  // Load recent projects on mount
  useEffect(() => {
    window.api.getRecentProjects().then(setRecentProjects)

    const handleProjectOpened = (data: ProjectInfo): void => {
      setProject(data)
      setWebviewUrl(null)
      setServerStatus({ status: 'starting' })
    }

    const handleServerStatus = (data: ServerStatus): void => {
      setServerStatus(data)
      if (data.status === 'running' && data.url) {
        setWebviewUrl(data.url)
        setIsWebviewLoading(true)
      }
    }

    const handleFileChanged = (): void => {
      if (webviewRef.current) {
        // Small delay to let build finish
        setTimeout(() => {
          try { webviewRef.current?.reload() } catch (_) {}
        }, 500)
      }
    }

    window.api.onProjectOpened(handleProjectOpened)
    window.api.onServerStatus(handleServerStatus as any)
    window.api.onFileChanged(handleFileChanged)

    return () => {
      window.api.removeAllListeners('project-opened')
      window.api.removeAllListeners('server-status')
      window.api.removeAllListeners('file-changed')
    }
  }, [])

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey) {
        if (e.key === 'k') { e.preventDefault(); handleScreenshot() }
        if (e.key === 'e') { e.preventDefault(); handleExport() }
        if (e.key === 'r') { e.preventDefault(); handleRefresh() }
        if (e.key === 'o') { e.preventDefault(); handleSelectProject() }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [project, serverStatus, webviewUrl])

  const handleSelectProject = useCallback(async () => {
    const path = await window.api.selectProject()
    if (path) {
      const updated = await window.api.getRecentProjects()
      setRecentProjects(updated)
    }
  }, [])

  const handleOpenRecent = useCallback(async (path: string) => {
    await window.api.openRecentProject(path)
    const updated = await window.api.getRecentProjects()
    setRecentProjects(updated)
  }, [])

  const handleRefresh = useCallback(() => {
    if (webviewRef.current) {
      try { webviewRef.current.reload() } catch (_) {}
    }
  }, [])

  const handleScreenshot = useCallback(async () => {
    if (!webviewRef.current) {
      setStatusMsg('❌ 无预览可截图')
      setTimeout(() => setStatusMsg(''), 3000)
      return
    }

    // Flash animation
    setFlashActive(true)
    setTimeout(() => setFlashActive(false), 300)

    try {
      const wc = webviewRef.current as any
      const wcId = wc.getWebContentsId?.()
      if (!wcId) throw new Error('No webContentsId')

      const dataUrl = await window.api.captureWebview(wcId)
      if (!dataUrl) throw new Error('Capture returned null')

      const editor = editorRef.current
      if (!editor) throw new Error('No tldraw editor')

      // Create image asset
      const assetId = `asset:${Date.now()}` as any
      const shapeId = createShapeId()
      const timestamp = new Date().toLocaleTimeString('zh-CN')

      editor.createAssets([{
        id: assetId,
        typeName: 'asset',
        type: 'image',
        props: {
          name: `screenshot-${timestamp}.png`,
          src: dataUrl,
          w: 680,
          h: 460,
          mimeType: 'image/png',
          isAnimated: false,
        },
        meta: {}
      }])

      const viewport = editor.getViewportPageBounds()
      const x = viewport.minX + 40
      const y = viewport.minY + 40

      editor.createShape({
        id: shapeId,
        type: 'image',
        x,
        y,
        props: { assetId, w: 680, h: 460 }
      })

      // Add label below
      const labelId = createShapeId()
      editor.createShape({
        id: labelId,
        type: 'text',
        x: x + 4,
        y: y + 468,
        props: {
          text: `📷 ${timestamp}`,
          color: 'grey',
          size: 's',
        }
      })

      editor.select(shapeId)
      editor.zoomToSelection()

      setStatusMsg('✅ 截图已添加到画布')
      setTimeout(() => setStatusMsg(''), 3000)
    } catch (err) {
      console.error('Screenshot error:', err)
      setStatusMsg('❌ 截图失败')
      setTimeout(() => setStatusMsg(''), 3000)
    }
  }, [])

  const handleExport = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return

    const shapes = editor.getCurrentPageShapes()
    const textShapes = shapes.filter((s: any) => s.type === 'text')

    if (textShapes.length === 0) {
      setStatusMsg('⚠️ 画布上没有文字标注')
      setTimeout(() => setStatusMsg(''), 3000)
      return
    }

    // Categorize by keywords
    const categories: Record<string, string[]> = {
      '颜色': [],
      '字体': [],
      '间距': [],
      '布局': [],
      '其他': []
    }

    const colorKw = /颜色|color|背景|bg|渐变|gradient|rgba?|#[0-9a-f]{3,6}/i
    const fontKw = /字体|font|字号|字重|文字|text|size|weight/i
    const spaceKw = /间距|margin|padding|gap|space|行高|line-height/i
    const layoutKw = /布局|layout|宽|高|width|height|flex|grid|对齐|align/i

    for (const shape of textShapes) {
      const text = (shape.props as any).text?.trim()
      if (!text) continue
      if (colorKw.test(text)) categories['颜色'].push(text)
      else if (fontKw.test(text)) categories['字体'].push(text)
      else if (spaceKw.test(text)) categories['间距'].push(text)
      else if (layoutKw.test(text)) categories['布局'].push(text)
      else categories['其他'].push(text)
    }

    const lines = [`# UIBridge 设计指令\n`, `> 项目：${project?.name || '未知'} | 导出时间：${new Date().toLocaleString('zh-CN')}\n`]

    for (const [cat, items] of Object.entries(categories)) {
      if (items.length === 0) continue
      lines.push(`\n## ${cat}\n`)
      items.forEach(item => lines.push(`- ${item}`))
    }

    const md = lines.join('\n')
    setExportContent(md)
    setShowExportModal(true)
  }, [project])

  const handleCopyExport = useCallback(() => {
    navigator.clipboard.writeText(exportContent)
    setStatusMsg('✅ 已复制到剪贴板')
    setTimeout(() => setStatusMsg(''), 3000)
  }, [exportContent])

  const handleSaveExport = useCallback(async () => {
    const result = await window.api.saveNotes(exportContent)
    if (result.success) {
      setStatusMsg(`✅ 已保存: ui-bridge-notes.md`)
    } else {
      setStatusMsg(`❌ 保存失败: ${result.error}`)
    }
    setTimeout(() => setStatusMsg(''), 3000)
    setShowExportModal(false)
  }, [exportContent])

  const projectName = project?.name ?? '未选择项目'
  const dotColor = STATUS_COLOR[serverStatus.status] ?? '#555'
  const dotLabel = STATUS_LABEL[serverStatus.status] ?? ''

  return (
    <div style={styles.root}>
      {/* Toolbar */}
      <div style={styles.toolbar}>
        <div style={styles.toolbarLeft}>
          <span style={styles.logo}>⬡ UIBridge</span>
          <span style={styles.separator} />
          <button style={styles.btnPrimary} onClick={handleSelectProject} title="Cmd+O">
            📁 选择项目
          </button>
          {recentProjects.length > 0 && (
            <select
              style={styles.select}
              value=""
              onChange={e => { if (e.target.value) handleOpenRecent(e.target.value) }}
            >
              <option value="">最近项目...</option>
              {recentProjects.map(p => (
                <option key={p} value={p}>{p.split('/').pop()}</option>
              ))}
            </select>
          )}
        </div>
        <div style={styles.toolbarCenter}>
          <span style={styles.projectName}>{projectName}</span>
          {project && (
            <span style={styles.badge}>{project.type}</span>
          )}
        </div>
        <div style={styles.toolbarRight}>
          <button style={styles.btnIcon} onClick={handleRefresh} title="刷新 Cmd+R">↺</button>
          <button style={styles.btnIcon} onClick={handleScreenshot} title="截图 Cmd+K">📷</button>
          <button style={styles.btnAccent} onClick={handleExport} title="导出 Cmd+E">导出指令</button>
        </div>
      </div>

      {/* Main content */}
      <div style={styles.content}>
        {/* Webview panel */}
        <div style={styles.previewPanel}>
          {!project ? (
            <div style={styles.emptyState}>
              <div style={styles.emptyIcon}>⬡</div>
              <div style={styles.emptyTitle}>欢迎使用 UIBridge</div>
              <div style={styles.emptyDesc}>选择一个前端项目开始可视化调试</div>
              <button style={{ ...styles.btnPrimary, marginTop: 20, padding: '10px 24px', fontSize: 14 }} onClick={handleSelectProject}>
                📁 选择项目
              </button>
            </div>
          ) : serverStatus.status === 'starting' ? (
            <div style={styles.loadingState}>
              <div style={styles.skeleton} />
              <div style={styles.skeleton} />
              <div style={styles.skeleton} />
              <div style={{ color: '#888', marginTop: 24, fontSize: 13 }}>启动 dev server 中...</div>
            </div>
          ) : webviewUrl ? (
            <div style={{ position: 'relative', width: '100%', height: '100%' }}>
              {isWebviewLoading && (
                <div style={styles.loadingOverlay}>
                  <div style={{ color: '#888', fontSize: 13 }}>加载中...</div>
                </div>
              )}
              {/* @ts-ignore */}
              <webview
                ref={webviewRef}
                src={webviewUrl}
                style={{ width: '100%', height: '100%', border: 'none' }}
                onDidFinishLoad={() => setIsWebviewLoading(false)}
                onDidStartLoading={() => setIsWebviewLoading(true)}
              />
              {flashActive && <div style={styles.flashOverlay} />}
            </div>
          ) : (
            <div style={styles.emptyState}>
              <div style={{ color: '#555', fontSize: 13 }}>
                {serverStatus.status === 'timeout' ? '⚠️ Dev server 启动超时' :
                 serverStatus.status === 'stopped' ? '⏹ Dev server 已停止' :
                 '等待 dev server...'}
              </div>
            </div>
          )}
        </div>

        {/* tldraw canvas */}
        <div style={styles.canvasPanel}>
          <Tldraw
            store={storeRef.current}
            onMount={editor => { editorRef.current = editor }}
            hideUi={false}
          />
        </div>
      </div>

      {/* Status bar */}
      <div style={styles.statusBar}>
        <div style={styles.statusLeft}>
          <span style={{ ...styles.dot, background: dotColor }} />
          <span style={styles.statusText}>{dotLabel}</span>
          {serverStatus.url && (
            <span style={{ ...styles.statusText, color: '#6366f1', marginLeft: 8 }}>
              {serverStatus.url}
            </span>
          )}
        </div>
        <div style={styles.statusRight}>
          {statusMsg && <span style={styles.statusMsg}>{statusMsg}</span>}
          <span style={styles.statusText}>Cmd+K 截图 · Cmd+E 导出 · Cmd+R 刷新 · Cmd+O 选项目</span>
        </div>
      </div>

      {/* Export modal */}
      {showExportModal && (
        <div style={styles.modalBg} onClick={() => setShowExportModal(false)}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <span style={styles.modalTitle}>📋 导出设计指令</span>
              <button style={styles.btnIcon} onClick={() => setShowExportModal(false)}>✕</button>
            </div>
            <pre style={styles.modalContent}>{exportContent}</pre>
            <div style={styles.modalFooter}>
              <button style={styles.btnPrimary} onClick={handleCopyExport}>复制到剪贴板</button>
              <button style={styles.btnAccent} onClick={handleSaveExport}>保存到项目目录</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Inline styles ─────────────────────────────── */
const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    width: '100vw',
    background: '#0c0c0c',
    color: '#f5f5f5',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: 13,
    overflow: 'hidden',
  },
  toolbar: {
    height: 48,
    minHeight: 48,
    display: 'flex',
    alignItems: 'center',
    padding: '0 12px',
    background: '#161616',
    borderBottom: '1px solid #2a2a2a',
    gap: 8,
    WebkitAppRegion: 'drag' as any,
    paddingLeft: 80, // space for traffic lights
  },
  toolbarLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    WebkitAppRegion: 'no-drag' as any,
  },
  toolbarCenter: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  toolbarRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    WebkitAppRegion: 'no-drag' as any,
  },
  logo: {
    fontSize: 15,
    fontWeight: 700,
    color: '#6366f1',
    letterSpacing: '0.02em',
  },
  separator: {
    width: 1,
    height: 20,
    background: '#2a2a2a',
  },
  projectName: {
    color: '#888',
    fontSize: 12,
    maxWidth: 240,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  badge: {
    background: '#2a2a2a',
    color: '#888',
    fontSize: 10,
    padding: '2px 6px',
    borderRadius: 4,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  btnPrimary: {
    background: '#1e1e1e',
    border: '1px solid #2a2a2a',
    color: '#f5f5f5',
    padding: '4px 12px',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 12,
    transition: 'all 150ms ease',
  },
  btnAccent: {
    background: '#6366f1',
    border: 'none',
    color: '#fff',
    padding: '5px 14px',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 500,
    transition: 'all 150ms ease',
  },
  btnIcon: {
    background: 'transparent',
    border: '1px solid #2a2a2a',
    color: '#888',
    padding: '4px 10px',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 14,
    transition: 'all 150ms ease',
  },
  select: {
    background: '#1e1e1e',
    border: '1px solid #2a2a2a',
    color: '#888',
    padding: '4px 8px',
    borderRadius: 6,
    fontSize: 12,
    cursor: 'pointer',
    maxWidth: 160,
  },
  content: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
  },
  previewPanel: {
    width: '42%',
    minWidth: 300,
    borderRight: '1px solid #2a2a2a',
    background: '#0c0c0c',
    position: 'relative' as const,
    overflow: 'hidden',
  },
  canvasPanel: {
    flex: 1,
    position: 'relative' as const,
    background: '#161616',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    gap: 8,
  },
  emptyIcon: {
    fontSize: 48,
    color: '#2a2a2a',
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: '#555',
  },
  emptyDesc: {
    fontSize: 13,
    color: '#444',
  },
  loadingState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    gap: 12,
    padding: 40,
  },
  skeleton: {
    width: '80%',
    height: 20,
    borderRadius: 4,
    background: 'linear-gradient(90deg, #1e1e1e 25%, #2a2a2a 50%, #1e1e1e 75%)',
    backgroundSize: '200% 100%',
    animation: 'shimmer 1.5s infinite',
  },
  loadingOverlay: {
    position: 'absolute' as const,
    inset: 0,
    background: 'rgba(12,12,12,0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  flashOverlay: {
    position: 'absolute' as const,
    inset: 0,
    background: 'white',
    opacity: 0,
    animation: 'flash 0.3s ease-out',
    pointerEvents: 'none',
    zIndex: 20,
  },
  statusBar: {
    height: 28,
    minHeight: 28,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 12px',
    background: '#0a0a0a',
    borderTop: '1px solid #1a1a1a',
  },
  statusLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  statusRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    display: 'inline-block',
  },
  statusText: {
    color: '#555',
    fontSize: 11,
  },
  statusMsg: {
    color: '#888',
    fontSize: 11,
  },
  // Modal
  modalBg: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    background: '#161616',
    border: '1px solid #2a2a2a',
    borderRadius: 12,
    width: 560,
    maxWidth: '90vw',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 16px',
    borderBottom: '1px solid #2a2a2a',
  },
  modalTitle: {
    fontWeight: 600,
    fontSize: 14,
  },
  modalContent: {
    padding: 16,
    margin: 0,
    fontFamily: '"SF Mono", "Fira Code", monospace',
    fontSize: 12,
    lineHeight: 1.7,
    color: '#ccc',
    background: '#0c0c0c',
    maxHeight: '50vh',
    overflow: 'auto',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  modalFooter: {
    display: 'flex',
    gap: 8,
    padding: 12,
    borderTop: '1px solid #2a2a2a',
    justifyContent: 'flex-end',
  },
}
