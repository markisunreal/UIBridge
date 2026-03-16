import { ElectronAPI } from '@electron-toolkit/preload'

interface ProjectInfo {
  path: string
  type: string
  name: string
}

interface ServerStatus {
  status: string
  port?: number
  url?: string
  code?: number
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      selectProject: () => Promise<string | null>
      getRecentProjects: () => Promise<string[]>
      openRecentProject: (path: string) => Promise<{ success: boolean; error?: string }>
      captureWebview: (webContentsId: number) => Promise<string | null>
      saveNotes: (content: string) => Promise<{ success: boolean; path?: string; error?: string }>
      getDevServerUrl: () => Promise<string | null>
      getCurrentProject: () => Promise<string | null>
      stopDevServer: () => Promise<{ success: boolean }>
      
      onProjectOpened: (callback: (data: ProjectInfo) => void) => void
      onServerStatus: (callback: (data: ServerStatus) => void) => void
      onServerLog: (callback: (data: { type: string; text: string }) => void) => void
      onFileChanged: (callback: (data: { path: string }) => void) => void
      removeAllListeners: (channel: string) => void
    }
  }
}
