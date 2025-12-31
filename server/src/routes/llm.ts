import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { llmStorage, LLMConfig } from '../storage/index.js'
import Anthropic from '@anthropic-ai/sdk'
import { fetch as undiciFetch, ProxyAgent } from 'undici'

const router = Router()

// 获取代理 URL 并确保格式正确
function getProxyUrl(): string | undefined {
  const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy
  if (!proxy) return undefined
  // 如果没有协议前缀，添加 http://
  if (!proxy.startsWith('http://') && !proxy.startsWith('https://')) {
    return `http://${proxy}`
  }
  return proxy
}

const proxyUrl = getProxyUrl()
const proxyAgent = proxyUrl ? new ProxyAgent(proxyUrl) : undefined

// 使用支持代理的 fetch
async function proxyFetch(url: string, options: RequestInit): Promise<Response> {
  const response = await undiciFetch(url, {
    method: options.method,
    headers: options.headers as Record<string, string>,
    body: options.body as string,
    dispatcher: proxyAgent
  })
  return response as unknown as Response
}

// Get all LLM configs (hide API keys)
router.get('/configs', (req, res) => {
  const configs = llmStorage.getAll().map(config => ({
    ...config,
    apiKey: config.apiKey ? '***' : ''
  }))
  res.json(configs)
})

// Get LLM config by id
router.get('/configs/:id', (req, res) => {
  const config = llmStorage.getById(req.params.id)
  if (!config) {
    return res.status(404).json({ error: 'Config not found' })
  }
  res.json({
    ...config,
    apiKey: config.apiKey ? '***' : ''
  })
})

// Create LLM config
router.post('/configs', (req, res) => {
  const config: LLMConfig = {
    id: uuidv4(),
    name: req.body.name,
    provider: req.body.provider,
    apiKey: req.body.apiKey,
    baseUrl: req.body.baseUrl || undefined,
    model: req.body.model,
    temperature: req.body.temperature ?? 0.7,
    maxTokens: req.body.maxTokens ?? 4096,
    isDefault: req.body.isDefault ?? false
  }
  llmStorage.add(config)
  res.status(201).json({
    ...config,
    apiKey: '***'
  })
})

// Update LLM config
router.put('/configs/:id', (req, res) => {
  const existing = llmStorage.getById(req.params.id)
  if (!existing) {
    return res.status(404).json({ error: 'Config not found' })
  }

  const updates = { ...req.body }
  // If apiKey is '***', don't update it
  if (updates.apiKey === '***') {
    delete updates.apiKey
  }

  llmStorage.update(req.params.id, updates)
  const updated = llmStorage.getById(req.params.id)!
  res.json({
    ...updated,
    apiKey: '***'
  })
})

// Delete LLM config
router.delete('/configs/:id', (req, res) => {
  const existing = llmStorage.getById(req.params.id)
  if (!existing) {
    return res.status(404).json({ error: 'Config not found' })
  }
  llmStorage.delete(req.params.id)
  res.status(204).send()
})

// Get available models
router.get('/models', (req, res) => {
  const models = {
    openai: [
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
      { id: 'gpt-4', name: 'GPT-4' },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' }
    ],
    anthropic: [
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku' },
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
      { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet' },
      { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku' }
    ],
    'openai-compatible': [
      { id: 'custom', name: '自定义模型 (手动输入)' }
    ]
  }
  res.json(models)
})

// Test LLM config (without saving)
router.post('/test', async (req, res) => {
  const { provider, apiKey, baseUrl, model } = req.body

  if (!provider || !model) {
    return res.status(400).json({ success: false, error: '缺少必要参数' })
  }

  try {
    if (provider === 'openai' || provider === 'openai-compatible') {
      // 使用原生 fetch 进行测试
      const url = baseUrl || 'https://api.openai.com/v1'
      const response = await proxyFetch(`${url}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey || ''}`
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: 'user', content: 'Hi, please respond with "OK" only.' }],
          max_tokens: 10
        })
      })

      if (!response.ok) {
        const errorData = await response.text()
        return res.json({
          success: false,
          error: `API 错误 (${response.status}): ${errorData}`
        })
      }

      const data = await response.json() as { choices: Array<{ message: { content: string } }> }
      const content = data.choices?.[0]?.message?.content || ''
      res.json({
        success: true,
        message: '连接成功',
        response: content
      })
    } else if (provider === 'anthropic') {
      const client = new Anthropic({ apiKey })

      const response = await client.messages.create({
        model: model,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi, please respond with "OK" only.' }]
      })

      const content = response.content[0]?.type === 'text' ? response.content[0].text : ''
      res.json({
        success: true,
        message: '连接成功',
        response: content
      })
    } else {
      res.status(400).json({ success: false, error: '不支持的提供商' })
    }
  } catch (error: unknown) {
    console.error('LLM Test Error:', error)
    let errorMessage = '未知错误'
    if (error instanceof Error) {
      errorMessage = error.message
      if ('cause' in error && error.cause) {
        errorMessage += ` (${String(error.cause)})`
      }
    }
    res.json({
      success: false,
      error: errorMessage
    })
  }
})

// Test existing LLM config by ID
router.post('/test/:id', async (req, res) => {
  const config = llmStorage.getById(req.params.id)
  if (!config) {
    return res.status(404).json({ success: false, error: '配置不存在' })
  }

  try {
    if (config.provider === 'openai' || config.provider === 'openai-compatible') {
      // 使用原生 fetch 进行测试，避免 OpenAI SDK 的连接问题
      const baseUrl = config.baseUrl || 'https://api.openai.com/v1'
      const response = await proxyFetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model: config.model,
          messages: [{ role: 'user', content: 'Hi, please respond with "OK" only.' }],
          max_tokens: 10
        })
      })

      if (!response.ok) {
        const errorData = await response.text()
        return res.json({
          success: false,
          error: `API 错误 (${response.status}): ${errorData}`
        })
      }

      const data = await response.json() as { choices: Array<{ message: { content: string } }> }
      const content = data.choices?.[0]?.message?.content || ''
      res.json({
        success: true,
        message: '连接成功',
        response: content
      })
    } else if (config.provider === 'anthropic') {
      const client = new Anthropic({ apiKey: config.apiKey })

      const response = await client.messages.create({
        model: config.model,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi, please respond with "OK" only.' }]
      })

      const content = response.content[0]?.type === 'text' ? response.content[0].text : ''
      res.json({
        success: true,
        message: '连接成功',
        response: content
      })
    }
  } catch (error: unknown) {
    console.error('LLM Test Error:', error)
    let errorMessage = '未知错误'
    if (error instanceof Error) {
      errorMessage = error.message
      if ('cause' in error && error.cause) {
        errorMessage += ` (${String(error.cause)})`
      }
    }
    res.json({
      success: false,
      error: errorMessage
    })
  }
})

export default router
