import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { mcpStorage, MCPServerConfig } from '../storage/index.js'
import { mcpManager } from '../services/MCPManager.js'

const router = Router()

// Get all MCP configs
router.get('/configs', (req, res) => {
  const configs = mcpStorage.getAll()
  res.json(configs)
})

// Get MCP config by id
router.get('/configs/:id', (req, res) => {
  const config = mcpStorage.getById(req.params.id)
  if (!config) {
    return res.status(404).json({ error: 'Config not found' })
  }
  res.json(config)
})

// Create MCP config
router.post('/configs', (req, res) => {
  const config: MCPServerConfig = {
    id: uuidv4(),
    name: req.body.name,
    type: req.body.type || 'stdio',
    command: req.body.command,
    args: req.body.args || [],
    url: req.body.url,
    env: req.body.env || {},
    enabled: req.body.enabled ?? true
  }
  mcpStorage.add(config)
  res.status(201).json(config)
})

// Update MCP config
router.put('/configs/:id', (req, res) => {
  const existing = mcpStorage.getById(req.params.id)
  if (!existing) {
    return res.status(404).json({ error: 'Config not found' })
  }
  mcpStorage.update(req.params.id, req.body)
  res.json(mcpStorage.getById(req.params.id))
})

// Delete MCP config
router.delete('/configs/:id', async (req, res) => {
  const existing = mcpStorage.getById(req.params.id)
  if (!existing) {
    return res.status(404).json({ error: 'Config not found' })
  }
  await mcpManager.disconnect(req.params.id)
  mcpStorage.delete(req.params.id)
  res.status(204).send()
})

// Connect to MCP server
router.post('/connect/:id', async (req, res) => {
  const config = mcpStorage.getById(req.params.id)
  if (!config) {
    return res.status(404).json({ error: 'Config not found' })
  }
  try {
    await mcpManager.connect(config)
    res.json({ status: 'connected' })
  } catch (error) {
    console.error('MCP Connect Error:', error)
    let errorMessage = '连接失败'
    if (error instanceof Error) {
      errorMessage = error.message
      // 检查常见错误
      if (error.message.includes('ENOENT') || error.message.includes('spawn')) {
        errorMessage = `命令未找到: ${config.command}。请确保命令存在且在 PATH 中。`
      } else if (error.message.includes('ECONNREFUSED')) {
        errorMessage = `无法连接到 ${config.url}。请确保服务器正在运行。`
      } else if (error.message.includes('timeout')) {
        errorMessage = '连接超时，请检查 MCP 服务器是否正常响应。'
      } else if (error.message.includes('404') || error.message.includes('Non-200')) {
        errorMessage = `SSE 端点不存在 (404): ${config.url}。请检查 URL 是否正确，MCP 服务器是否已启动。`
      } else if (error.message.includes('401') || error.message.includes('403')) {
        errorMessage = `访问被拒绝: ${config.url}。请检查认证配置。`
      }
    }
    res.status(500).json({ error: errorMessage })
  }
})

// Disconnect from MCP server
router.post('/disconnect/:id', async (req, res) => {
  try {
    await mcpManager.disconnect(req.params.id)
    res.json({ status: 'disconnected' })
  } catch (error) {
    res.status(500).json({ error: String(error) })
  }
})

// Get MCP server status
router.get('/status', (req, res) => {
  const status = mcpManager.getStatus()
  res.json(status)
})

// Get tools from connected MCP servers
router.get('/tools', async (req, res) => {
  const tools = await mcpManager.getAllTools()
  res.json(tools)
})

export default router
