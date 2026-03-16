#!/usr/bin/env node
/**
 * UIBridge MCP Server
 * Exposes UIBridge capabilities to Claude Code via MCP (stdio transport).
 *
 * Configure in Claude Code:
 *   ~/Library/Application Support/Claude/claude_desktop_config.json
 *   {
 *     "mcpServers": {
 *       "uibridge": {
 *         "command": "node",
 *         "args": ["/Users/metamark/UIBridge/mcp-server/index.js"]
 *       }
 *     }
 *   }
 */

const http = require('http')

const UIBRIDGE_PORT = 3765
const UIBRIDGE_BASE = `http://127.0.0.1:${UIBRIDGE_PORT}`

// ── Minimal JSON-RPC / MCP over stdio ────────────────────────────────────────

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n')
}

function apiGet(path) {
  return new Promise((resolve, reject) => {
    http.get(`${UIBRIDGE_BASE}${path}`, (res) => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) } catch (e) { reject(e) }
      })
    }).on('error', reject)
  })
}

function apiPost(path, body = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body)
    const req = http.request(`${UIBRIDGE_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    }, (res) => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) } catch (e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'capture_ui',
    description: 'Take a screenshot of the current UI being previewed in UIBridge. Returns a base64 PNG image. Use this to see the current state of the frontend you\'re developing.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'get_annotations',
    description: 'Get the design annotations and notes written on the UIBridge tldraw canvas. These are text labels, arrows, and comments added by the designer to describe desired UI changes.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'get_project_info',
    description: 'Get information about the currently open project in UIBridge, including the project path and dev server URL.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'get_ui_context',
    description: 'Get the full UI context: project info + current screenshot + canvas annotations. Use this as your starting point when the user asks you to make UI changes. It gives you the complete picture of what the UI looks like and what changes are requested.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  }
]

// ── Request handler ───────────────────────────────────────────────────────────

async function handleRequest(req) {
  const { id, method, params } = req

  // initialize
  if (method === 'initialize') {
    return {
      jsonrpc: '2.0', id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'uibridge', version: '1.0.0' }
      }
    }
  }

  // notifications/initialized (no response needed)
  if (method === 'notifications/initialized') return null

  // tools/list
  if (method === 'tools/list') {
    return { jsonrpc: '2.0', id, result: { tools: TOOLS } }
  }

  // tools/call
  if (method === 'tools/call') {
    const toolName = params?.name
    let content = []

    try {
      // Check UIBridge is running
      let status
      try {
        status = await apiGet('/status')
      } catch (_) {
        return {
          jsonrpc: '2.0', id,
          result: {
            content: [{
              type: 'text',
              text: '❌ UIBridge is not running. Please start the UIBridge app first (cd /Users/metamark/UIBridge && npm run dev).'
            }],
            isError: true
          }
        }
      }

      if (toolName === 'capture_ui') {
        const result = await apiPost('/capture')
        if (result.success && result.dataUrl) {
          // Extract base64 from data URL
          const base64 = result.dataUrl.replace(/^data:image\/\w+;base64,/, '')
          content = [
            {
              type: 'text',
              text: `Screenshot captured at ${new Date().toLocaleTimeString('zh-CN')} (${result.width}×${result.height})`
            },
            {
              type: 'image',
              data: base64,
              mimeType: 'image/png'
            }
          ]
        } else {
          content = [{ type: 'text', text: '❌ Failed to capture screenshot. Make sure a project is open in UIBridge.' }]
        }

      } else if (toolName === 'get_annotations') {
        const result = await apiGet('/annotations')
        content = [{
          type: 'text',
          text: result.content
            ? `## UIBridge Canvas Annotations\n\n${result.content}`
            : '(No annotations on canvas yet. Add text notes in the tldraw canvas to describe desired UI changes.)'
        }]

      } else if (toolName === 'get_project_info') {
        const result = await apiGet('/project')
        content = [{
          type: 'text',
          text: [
            '## Current Project',
            `- **Path:** ${result.path || 'No project selected'}`,
            `- **Name:** ${result.name || 'N/A'}`,
            `- **Dev Server:** ${result.devServerUrl || 'Not running'}`
          ].join('\n')
        }]

      } else if (toolName === 'get_ui_context') {
        const result = await apiGet('/context')
        const base64 = result.screenshot
          ? result.screenshot.replace(/^data:image\/\w+;base64,/, '')
          : null

        const textParts = [
          '## UIBridge Context',
          '',
          '### Project',
          `- Path: ${result.project?.path || 'None'}`,
          `- Dev Server: ${result.project?.devServerUrl || 'Not running'}`,
          '',
          '### Annotations',
          result.annotations || '(No annotations yet)',
        ].join('\n')

        content = [{ type: 'text', text: textParts }]
        if (base64) {
          content.push({
            type: 'image',
            data: base64,
            mimeType: 'image/png'
          })
        }
      } else {
        content = [{ type: 'text', text: `Unknown tool: ${toolName}` }]
      }

    } catch (e) {
      content = [{ type: 'text', text: `Error: ${e.message}` }]
    }

    return { jsonrpc: '2.0', id, result: { content } }
  }

  // Unknown method
  return {
    jsonrpc: '2.0', id,
    error: { code: -32601, message: `Method not found: ${method}` }
  }
}

// ── Stdio transport ───────────────────────────────────────────────────────────

let buffer = ''

process.stdin.setEncoding('utf8')
process.stdin.on('data', async (chunk) => {
  buffer += chunk
  const lines = buffer.split('\n')
  buffer = lines.pop() ?? ''

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const req = JSON.parse(trimmed)
      const response = await handleRequest(req)
      if (response) send(response)
    } catch (e) {
      send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })
    }
  }
})

process.stdin.on('end', () => process.exit(0))
process.stderr.write('[UIBridge MCP] Server started, waiting for requests...\n')
