import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  selectProject: () => ipcRenderer.invoke('select-project'),
  getRecentProjects: () => ipcRenderer.invoke('get-recent-projects'),
  openRecentProject: (path: string) => ipcRenderer.invoke('open-recent-project', path),
  captureWebview: (webContentsId: number) => ipcRenderer.invoke('capture-webview', webContentsId),
  saveNotes: (content: string) => ipcRenderer.invoke('save-notes', content),
  getDevServerUrl: () => ipcRenderer.invoke('get-dev-server-url'),
  getCurrentProject: () => ipcRenderer.invoke('get-current-project'),
  stopDevServer: () => ipcRenderer.invoke('stop-dev-server'),
  
  onProjectOpened: (callback: (data: { path: string; type: string; name: string }) => void) => {
    ipcRenderer.on('project-opened', (_, data) => callback(data))
  },
  onServerStatus: (callback: (data: { status: string; port?: number; url?: string; code?: number }) => void) => {
    ipcRenderer.on('server-status', (_, data) => callback(data))
  },
  onServerLog: (callback: (data: { type: string; text: string }) => void) => {
    ipcRenderer.on('server-log', (_, data) => callback(data))
  },
  onFileChanged: (callback: (data: { path: string }) => void) => {
    ipcRenderer.on('file-changed', (_, data) => callback(data))
  },
  
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel)
  },

  // MCP bridge: push annotations to main process
  mcpUpdateAnnotations: (annotations: string) => {
    ipcRenderer.send('mcp-update-annotations', annotations)
  },
  // MCP bridge: push webview capture to main process
  mcpCaptureResult: (dataUrl: string) => {
    ipcRenderer.send('mcp-capture-result', dataUrl)
  },
  // MCP bridge: listen for capture requests from main
  onMcpCaptureRequest: (callback: () => void) => {
    ipcRenderer.on('mcp-capture-request', () => callback())
  }
}

// Use `contextBridge` APIs to expose Electron APIs to renderer
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
