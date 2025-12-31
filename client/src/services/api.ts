import axios from 'axios'

const api = axios.create({
  baseURL: '/api'
})

export interface MCPTool {
  name: string
  description?: string
  inputSchema: unknown
}

export interface MCPServerConfig {
  id: string
  name: string
  type: 'stdio' | 'sse' | 'streamable-http'
  command?: string
  args?: string[]
  url?: string
  env?: Record<string, string>
  enabled: boolean
  tools?: MCPTool[]
}

export interface LLMConfig {
  id: string
  name: string
  provider: 'openai' | 'anthropic' | 'openai-compatible'
  apiKey: string
  baseUrl?: string
  model: string
  temperature: number
  maxTokens: number
  systemPrompt?: string
  isDefault: boolean
}

export interface Conversation {
  id: string
  title: string
  messageCount?: number
  createdAt: number
  updatedAt: number
}

export interface MessagePart {
  type: 'text' | 'tool_call'
  text?: string
  toolCall?: {
    id: string
    name: string
    arguments: Record<string, unknown>
    result?: unknown
  }
}

export interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
  parts?: MessagePart[]  // 助手消息的交错内容
  timestamp: number
}

// MCP API
export const mcpApi = {
  getConfigs: () => api.get<MCPServerConfig[]>('/mcp/configs').then(r => r.data),
  createConfig: (config: Partial<MCPServerConfig>) => api.post<MCPServerConfig>('/mcp/configs', config).then(r => r.data),
  updateConfig: (id: string, config: Partial<MCPServerConfig>) => api.put<MCPServerConfig>(`/mcp/configs/${id}`, config).then(r => r.data),
  deleteConfig: (id: string) => api.delete(`/mcp/configs/${id}`),
  connect: (id: string) => api.post(`/mcp/connect/${id}`).then(r => r.data),
  disconnect: (id: string) => api.post(`/mcp/disconnect/${id}`).then(r => r.data),
  getStatus: () => api.get<Record<string, { connected: boolean; toolCount: number }>>('/mcp/status').then(r => r.data),
  getTools: () => api.get('/mcp/tools').then(r => r.data)
}

export interface LLMTestResult {
  success: boolean
  message?: string
  response?: string
  error?: string
}

// LLM API
export const llmApi = {
  getConfigs: () => api.get<LLMConfig[]>('/llm/configs').then(r => r.data),
  createConfig: (config: Partial<LLMConfig>) => api.post<LLMConfig>('/llm/configs', config).then(r => r.data),
  updateConfig: (id: string, config: Partial<LLMConfig>) => api.put<LLMConfig>(`/llm/configs/${id}`, config).then(r => r.data),
  deleteConfig: (id: string) => api.delete(`/llm/configs/${id}`),
  getModels: () => api.get<Record<string, { id: string; name: string }[]>>('/llm/models').then(r => r.data),
  // 测试未保存的配置
  testConfig: (config: { provider: string; apiKey: string; baseUrl?: string; model: string }) =>
    api.post<LLMTestResult>('/llm/test', config).then(r => r.data),
  // 测试已保存的配置
  testConfigById: (id: string) => api.post<LLMTestResult>(`/llm/test/${id}`).then(r => r.data)
}

// Chat API
export const chatApi = {
  getConversations: () => api.get<Conversation[]>('/chat/conversations').then(r => r.data),
  getConversation: (id: string) => api.get<Conversation & { messages: Message[] }>(`/chat/conversations/${id}`).then(r => r.data),
  createConversation: (title?: string) => api.post<Conversation>('/chat/conversations', { title }).then(r => r.data),
  deleteConversation: (id: string) => api.delete(`/chat/conversations/${id}`),
  sendMessage: async (
    message: string,
    conversationId?: string,
    llmConfigId?: string,
    onChunk?: (data: { type: string; content?: string; conversationId?: string }) => void
  ) => {
    const response = await fetch('/api/chat/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, conversationId, llmConfigId })
    })

    const reader = response.body?.getReader()
    const decoder = new TextDecoder()

    if (!reader) throw new Error('No response body')

    let result = null
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const text = decoder.decode(value)
      const lines = text.split('\n').filter(line => line.startsWith('data: '))

      for (const line of lines) {
        const data = JSON.parse(line.slice(6))
        if (onChunk) onChunk(data)
        if (data.type === 'done') {
          result = data
        }
      }
    }

    return result
  }
}

// Settings API
export interface Settings {
  systemPrompt?: string
}

export const settingsApi = {
  get: () => api.get<Settings>('/settings').then(r => r.data),
  update: (settings: Settings) => api.put<Settings>('/settings', settings).then(r => r.data),
  getSystemPrompt: () => api.get<{ systemPrompt: string }>('/settings/system-prompt').then(r => r.data.systemPrompt),
  setSystemPrompt: (systemPrompt: string) => api.put<{ systemPrompt: string }>('/settings/system-prompt', { systemPrompt }).then(r => r.data.systemPrompt)
}
