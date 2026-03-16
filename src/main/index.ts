import { app, shell, BrowserWindow, ipcMain, dialog, globalShortcut, WebContentsView } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { spawn, ChildProcess } from 'child_process'
import * as fs from 'fs'
import Store from 'electron-store'
import * as chokidar from 'chokidar'

interface StoreSchema {
  recentProjects: string[]
}

const store = new Store<StoreSchema>({
  defaults: {
    recentProjects: []
  }
})

let mainWindow: BrowserWindow | null = null
let devServerProcess: ChildProcess | null = null
let fileWatcher: chokidar.FSWatcher | null = null
let currentProjectPath: string | null = null
let devServerPort: number | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0c0c0c',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 14 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webviewTag: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer based on electron-vite cli
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// IPC handlers
ipcMain.handle('select-project', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
    title: '选择项目目录'
  })
  if (result.canceled || result.filePaths.length === 0) return null

  const projectPath = result.filePaths[0]
  await setupProject(projectPath)
  return projectPath
})

ipcMain.handle('get-recent-projects', () => {
  return store.get('recentProjects', [])
})

ipcMain.handle('open-recent-project', async (_, projectPath: string) => {
  if (!fs.existsSync(projectPath)) {
    return { success: false, error: 'Project directory not found' }
  }
  await setupProject(projectPath)
  return { success: true }
})

ipcMain.handle('capture-screenshot', async () => {
  if (!mainWindow) return null
  
  try {
    // Get the webview contents
    const allWebContents = mainWindow.webContents
    const webviewContents = allWebContents
    
    // We'll capture via IPC from renderer which has the webview
    return null
  } catch (e) {
    console.error('Screenshot error:', e)
    return null
  }
})

ipcMain.handle('capture-webview', async (_, webContentsId: number) => {
  try {
    const { webContents } = require('electron')
    const wc = webContents.fromId(webContentsId)
    if (!wc) return null
    
    const image = await wc.capturePage()
    return image.toDataURL()
  } catch (e) {
    console.error('Capture error:', e)
    return null
  }
})

ipcMain.handle('save-notes', async (_, content: string) => {
  if (!currentProjectPath) return { success: false, error: 'No project selected' }
  
  const notesPath = join(currentProjectPath, 'ui-bridge-notes.md')
  try {
    fs.writeFileSync(notesPath, content, 'utf-8')
    return { success: true, path: notesPath }
  } catch (e) {
    return { success: false, error: String(e) }
  }
})

ipcMain.handle('get-dev-server-url', () => {
  if (devServerPort) return `http://localhost:${devServerPort}`
  return null
})

ipcMain.handle('get-current-project', () => {
  return currentProjectPath
})

ipcMain.handle('stop-dev-server', () => {
  stopDevServer()
  return { success: true }
})

async function setupProject(projectPath: string): Promise<void> {
  currentProjectPath = projectPath
  
  // Save to recent projects
  const recent = store.get('recentProjects', []) as string[]
  const updated = [projectPath, ...recent.filter(p => p !== projectPath)].slice(0, 5)
  store.set('recentProjects', updated)
  
  // Detect project type
  const packageJsonPath = join(projectPath, 'package.json')
  let projectType = 'unknown'
  
  if (fs.existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
      if (pkg.dependencies?.next || pkg.devDependencies?.next) {
        projectType = 'nextjs'
      } else if (pkg.dependencies?.vite || pkg.devDependencies?.vite) {
        projectType = 'vite-react'
      } else {
        projectType = 'node'
      }
    } catch (e) {
      projectType = 'unknown'
    }
  } else if (fs.existsSync(join(projectPath, 'index.html'))) {
    projectType = 'html'
  }
  
  // Notify renderer
  mainWindow?.webContents.send('project-opened', {
    path: projectPath,
    type: projectType,
    name: projectPath.split('/').pop()
  })
  
  // Stop existing server
  stopDevServer()
  
  // Start dev server if has package.json with dev script
  if (fs.existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
      if (pkg.scripts?.dev) {
        startDevServer(projectPath)
      }
    } catch (e) {
      console.error('Failed to read package.json:', e)
    }
  }
  
  // Setup file watcher
  setupFileWatcher(projectPath)
}

function startDevServer(projectPath: string): void {
  mainWindow?.webContents.send('server-status', { status: 'starting' })
  
  devServerProcess = spawn('npm', ['run', 'dev'], {
    cwd: projectPath,
    shell: true,
    env: { ...process.env, FORCE_COLOR: '0' }
  })
  
  const timeout = setTimeout(() => {
    if (!devServerPort) {
      mainWindow?.webContents.send('server-status', { status: 'timeout' })
    }
  }, 30000)
  
  devServerProcess.stdout?.on('data', (data: Buffer) => {
    const output = data.toString()
    console.log('Dev server:', output)
    
    // Parse port from output
    const portMatch = output.match(/(?:localhost:|http:\/\/localhost:)(\d+)/i) ||
                      output.match(/Local:\s+http:\/\/localhost:(\d+)/i) ||
                      output.match(/port[:\s]+(\d+)/i)
    
    if (portMatch && !devServerPort) {
      devServerPort = parseInt(portMatch[1])
      clearTimeout(timeout)
      mainWindow?.webContents.send('server-status', { 
        status: 'running', 
        port: devServerPort,
        url: `http://localhost:${devServerPort}`
      })
    }
    
    mainWindow?.webContents.send('server-log', { type: 'stdout', text: output })
  })
  
  devServerProcess.stderr?.on('data', (data: Buffer) => {
    const output = data.toString()
    mainWindow?.webContents.send('server-log', { type: 'stderr', text: output })
    
    // Some servers output to stderr too
    const portMatch = output.match(/(?:localhost:|http:\/\/localhost:)(\d+)/i) ||
                      output.match(/Local:\s+http:\/\/localhost:(\d+)/i)
    
    if (portMatch && !devServerPort) {
      devServerPort = parseInt(portMatch[1])
      clearTimeout(timeout)
      mainWindow?.webContents.send('server-status', { 
        status: 'running', 
        port: devServerPort,
        url: `http://localhost:${devServerPort}`
      })
    }
  })
  
  devServerProcess.on('close', (code) => {
    clearTimeout(timeout)
    devServerPort = null
    mainWindow?.webContents.send('server-status', { status: 'stopped', code })
  })
}

function stopDevServer(): void {
  if (devServerProcess) {
    devServerProcess.kill()
    devServerProcess = null
    devServerPort = null
  }
}

function setupFileWatcher(projectPath: string): void {
  if (fileWatcher) {
    fileWatcher.close()
    fileWatcher = null
  }
  
  // Watch src directory and public files
  const watchPaths = [
    join(projectPath, 'src'),
    join(projectPath, 'public'),
    join(projectPath, 'pages'),
    join(projectPath, 'app'),
    join(projectPath, 'components')
  ].filter(p => fs.existsSync(p))
  
  if (watchPaths.length === 0) watchPaths.push(projectPath)
  
  fileWatcher = chokidar.watch(watchPaths, {
    ignored: /(node_modules|\.git|\.next|dist|out)/,
    persistent: true,
    ignoreInitial: true
  })
  
  let reloadTimeout: NodeJS.Timeout | null = null
  
  const triggerReload = (filePath: string): void => {
    if (reloadTimeout) clearTimeout(reloadTimeout)
    reloadTimeout = setTimeout(() => {
      mainWindow?.webContents.send('file-changed', { path: filePath })
    }, 300)
  }
  
  fileWatcher.on('change', triggerReload)
  fileWatcher.on('add', triggerReload)
  fileWatcher.on('unlink', triggerReload)
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.uibridge.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  stopDevServer()
  if (fileWatcher) fileWatcher.close()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  stopDevServer()
})
