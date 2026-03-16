import { useEffect, useRef, useCallback } from 'react'
import {
  Tldraw,
  Editor,
  createShapeId,
  AssetRecordType,
  getHashForString
} from 'tldraw'
import 'tldraw/tldraw.css'

interface CanvasPanelProps {
  pendingScreenshot: string | null
  onScreenshotConsumed: () => void
  onEditorReady: (editor: Editor) => void
}

export function CanvasPanel({ pendingScreenshot, onScreenshotConsumed, onEditorReady }: CanvasPanelProps): JSX.Element {
  const editorRef = useRef<Editor | null>(null)

  const handleMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor
      onEditorReady(editor)
      
      // Dark theme overrides
      editor.updateInstanceState({ isDebugMode: false })
    },
    [onEditorReady]
  )

  // Handle pending screenshot
  useEffect(() => {
    if (!pendingScreenshot || !editorRef.current) return

    const editor = editorRef.current
    addScreenshotToCanvas(editor, pendingScreenshot)
    onScreenshotConsumed()
  }, [pendingScreenshot, onScreenshotConsumed])

  return (
    <div
      style={{
        flex: 1,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: '#1a1a1a',
        position: 'relative'
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
        <span style={{ color: '#555', fontSize: 11 }}>CANVAS</span>
        <span style={{ color: '#2a2a2a', fontSize: 11 }}>—</span>
        <span style={{ color: '#555', fontSize: 10 }}>⌘K to capture • T to add text</span>
      </div>

      {/* tldraw canvas */}
      <div style={{ flex: 1, position: 'relative' }}>
        <Tldraw
          onMount={handleMount}
          hideUi={false}
        />
      </div>
    </div>
  )
}

async function addScreenshotToCanvas(editor: Editor, dataUrl: string): Promise<void> {
  try {
    // Create image dimensions
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = reject
      img.src = dataUrl
    })

    const originalWidth = img.naturalWidth
    const originalHeight = img.naturalHeight
    
    // Target width 680px
    const targetWidth = 680
    const scale = targetWidth / originalWidth
    const targetHeight = originalHeight * scale

    // Create asset
    const assetId = AssetRecordType.createId(getHashForString(dataUrl))
    const shapeId = createShapeId()
    const timestamp = new Date().toLocaleTimeString('zh-CN', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    })

    // Get current viewport center
    const viewportBounds = editor.getViewportScreenBounds()
    const centerX = viewportBounds.x + viewportBounds.w / 2
    const centerY = viewportBounds.y + viewportBounds.h / 2
    const point = editor.screenToPage({ x: centerX, y: centerY })

    // Create asset record
    editor.createAssets([
      {
        id: assetId,
        type: 'image',
        typeName: 'asset',
        props: {
          name: `screenshot-${timestamp}`,
          src: dataUrl,
          w: targetWidth,
          h: targetHeight,
          mimeType: 'image/png',
          isAnimated: false
        },
        meta: {}
      }
    ])

    // Create image shape
    editor.createShapes([
      {
        id: shapeId,
        type: 'image',
        x: point.x - targetWidth / 2,
        y: point.y - targetHeight / 2,
        props: {
          assetId,
          w: targetWidth,
          h: targetHeight
        }
      }
    ])

    // Add timestamp label below the image
    const labelId = createShapeId()
    editor.createShapes([
      {
        id: labelId,
        type: 'text',
        x: point.x - targetWidth / 2,
        y: point.y + targetHeight / 2 + 8,
        props: {
          text: `📷 Screenshot ${timestamp}`,
          size: 's',
          color: 'grey'
        }
      }
    ])

    // Select and zoom to the new screenshot
    editor.setSelectedShapes([shapeId])
    editor.zoomToSelection({ animation: { duration: 300 } })
    
    // Focus canvas
    editor.focus()
  } catch (e) {
    console.error('Failed to add screenshot to canvas:', e)
  }
}
