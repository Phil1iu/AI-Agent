import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CONFIG_DIR = join(__dirname, '../../config')
const DATA_DIR = join(__dirname, '../../data')

// Ensure directories exist
if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true })
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })

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
  tools?: MCPTool[]  // 持久化的工具列表
}

export interface LLMConfig {
  id: string
  name: string
  provider: 'openai' | 'anthropic' | 'openai-compatible'
  apiKey: string
  baseUrl?: string  // 用于 OpenAI 兼容模型的自定义 API 地址
  model: string
  temperature: number
  maxTokens: number
  systemPrompt?: string  // 系统提示词
  isDefault: boolean
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
  content: string  // 用户消息的完整内容，助手消息的纯文本摘要
  parts?: MessagePart[]  // 助手消息的交错内容（文本和工具调用按顺序排列）
  timestamp: number
}

export interface Conversation {
  id: string
  title: string
  messages: Message[]
  createdAt: number
  updatedAt: number
}

export interface Settings {
  systemPrompt?: string
}

function loadJson<T>(filename: string, defaultValue: T): T {
  const filepath = join(CONFIG_DIR, filename)
  if (!existsSync(filepath)) {
    saveJson(filename, defaultValue)
    return defaultValue
  }
  try {
    return JSON.parse(readFileSync(filepath, 'utf-8'))
  } catch {
    return defaultValue
  }
}

function saveJson<T>(filename: string, data: T): void {
  const filepath = join(CONFIG_DIR, filename)
  writeFileSync(filepath, JSON.stringify(data, null, 2))
}

function loadDataJson<T>(filename: string, defaultValue: T): T {
  const filepath = join(DATA_DIR, filename)
  if (!existsSync(filepath)) {
    saveDataJson(filename, defaultValue)
    return defaultValue
  }
  try {
    return JSON.parse(readFileSync(filepath, 'utf-8'))
  } catch {
    return defaultValue
  }
}

function saveDataJson<T>(filename: string, data: T): void {
  const filepath = join(DATA_DIR, filename)
  writeFileSync(filepath, JSON.stringify(data, null, 2))
}

// MCP Config Storage
export const mcpStorage = {
  getAll: (): MCPServerConfig[] => loadJson('mcp.json', []),
  save: (configs: MCPServerConfig[]) => saveJson('mcp.json', configs),
  getById: (id: string): MCPServerConfig | undefined => {
    return mcpStorage.getAll().find(c => c.id === id)
  },
  add: (config: MCPServerConfig) => {
    const configs = mcpStorage.getAll()
    configs.push(config)
    mcpStorage.save(configs)
  },
  update: (id: string, updates: Partial<MCPServerConfig>) => {
    const configs = mcpStorage.getAll()
    const index = configs.findIndex(c => c.id === id)
    if (index !== -1) {
      configs[index] = { ...configs[index], ...updates }
      mcpStorage.save(configs)
    }
  },
  delete: (id: string) => {
    const configs = mcpStorage.getAll().filter(c => c.id !== id)
    mcpStorage.save(configs)
  }
}

// LLM Config Storage
export const llmStorage = {
  getAll: (): LLMConfig[] => loadJson('llm.json', []),
  save: (configs: LLMConfig[]) => saveJson('llm.json', configs),
  getById: (id: string): LLMConfig | undefined => {
    return llmStorage.getAll().find(c => c.id === id)
  },
  getDefault: (): LLMConfig | undefined => {
    return llmStorage.getAll().find(c => c.isDefault)
  },
  add: (config: LLMConfig) => {
    const configs = llmStorage.getAll()
    if (config.isDefault) {
      configs.forEach(c => c.isDefault = false)
    }
    configs.push(config)
    llmStorage.save(configs)
  },
  update: (id: string, updates: Partial<LLMConfig>) => {
    const configs = llmStorage.getAll()
    const index = configs.findIndex(c => c.id === id)
    if (index !== -1) {
      if (updates.isDefault) {
        configs.forEach(c => c.isDefault = false)
      }
      configs[index] = { ...configs[index], ...updates }
      llmStorage.save(configs)
    }
  },
  delete: (id: string) => {
    const configs = llmStorage.getAll().filter(c => c.id !== id)
    llmStorage.save(configs)
  }
}

// Conversation Storage
export const conversationStorage = {
  getAll: (): Conversation[] => loadDataJson('conversations.json', []),
  save: (conversations: Conversation[]) => saveDataJson('conversations.json', conversations),
  getById: (id: string): Conversation | undefined => {
    return conversationStorage.getAll().find(c => c.id === id)
  },
  create: (conversation: Conversation) => {
    const conversations = conversationStorage.getAll()
    conversations.unshift(conversation)
    conversationStorage.save(conversations)
  },
  update: (id: string, updates: Partial<Conversation>) => {
    const conversations = conversationStorage.getAll()
    const index = conversations.findIndex(c => c.id === id)
    if (index !== -1) {
      conversations[index] = { ...conversations[index], ...updates, updatedAt: Date.now() }
      conversationStorage.save(conversations)
    }
  },
  addMessage: (conversationId: string, message: Message) => {
    const conversations = conversationStorage.getAll()
    const conversation = conversations.find(c => c.id === conversationId)
    if (conversation) {
      conversation.messages.push(message)
      conversation.updatedAt = Date.now()
      conversationStorage.save(conversations)
    }
  },
  delete: (id: string) => {
    const conversations = conversationStorage.getAll().filter(c => c.id !== id)
    conversationStorage.save(conversations)
  }
}

// Settings Storage
export const settingsStorage = {
  get: (): Settings => loadJson('settings.json', {}),
  save: (settings: Settings) => saveJson('settings.json', settings),
  getSystemPrompt: (): string | undefined => {
    return settingsStorage.get().systemPrompt
  },
  setSystemPrompt: (prompt: string | undefined) => {
    const settings = settingsStorage.get()
    settings.systemPrompt = prompt
    settingsStorage.save(settings)
  }
}
