import dns from 'dns'
import express from 'express'
import cors from 'cors'
import mcpRoutes from './routes/mcp.js'
import llmRoutes from './routes/llm.js'
import chatRoutes from './routes/chat.js'
import settingsRoutes from './routes/settings.js'
import { mcpStorage } from './storage/index.js'
import { mcpManager } from './services/MCPManager.js'

// Fix for Windows DNS resolution - prefer IPv4 to avoid connection timeout issues
dns.setDefaultResultOrder('ipv4first')

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())

// Routes
app.use('/api/mcp', mcpRoutes)
app.use('/api/llm', llmRoutes)
app.use('/api/chat', chatRoutes)
app.use('/api/settings', settingsRoutes)

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' })
})

// Auto-connect enabled MCP servers on startup
async function autoConnectMCP() {
  const configs = mcpStorage.getAll().filter(c => c.enabled)
  console.log(`Auto-connecting ${configs.length} MCP server(s)...`)

  for (const config of configs) {
    try {
      await mcpManager.connect(config)
      console.log(`✓ Connected to MCP: ${config.name}`)
    } catch (error) {
      console.error(`✗ Failed to connect MCP "${config.name}":`, error instanceof Error ? error.message : error)
    }
  }
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
  // Auto-connect MCP servers after server starts
  autoConnectMCP()
})
