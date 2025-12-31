import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { llmStorage, settingsStorage, LLMConfig } from '../storage/index.js'
import { fetch as undiciFetch, ProxyAgent, RequestInit } from 'undici'

// 获取代理 URL
function getProxyUrl(): string | undefined {
  const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy
  if (!proxy) return undefined
  if (!proxy.startsWith('http://') && !proxy.startsWith('https://')) {
    return `http://${proxy}`
  }
  return proxy
}

const proxyUrl = getProxyUrl()
const proxyAgent = proxyUrl ? new ProxyAgent(proxyUrl) : undefined

// 打印代理状态
if (proxyUrl) {
  console.log(`[LLMService] Using proxy: ${proxyUrl}`)
} else {
  console.log('[LLMService] No proxy configured')
}

// 创建支持代理的 fetch 函数
const customFetch = proxyAgent
  ? ((url: unknown, init?: unknown) => undiciFetch(url as string, { ...(init as RequestInit), dispatcher: proxyAgent })) as unknown as typeof fetch
  : undefined

interface Tool {
  name: string
  description?: string
  inputSchema: unknown
}

interface ToolCallInfo {
  id: string
  name: string
  arguments: Record<string, unknown>
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  tool_calls?: ToolCallInfo[]
  tool_call_id?: string
}

type StreamCallback = (chunk: string) => void

// 解析文本格式的工具调用（兼容模式下 LLM 可能输出文本而非 tool_calls）
function parseTextToolCalls(content: string): Array<{ id: string; name: string; arguments: Record<string, unknown> }> | undefined {
  const toolCallPattern = /\[Calling Tool:\s*(\w+)\]\s*Arguments:\s*(\{[\s\S]*?\}(?=\s*\[Calling Tool:|\s*$))/g
  const matches: Array<{ id: string; name: string; arguments: Record<string, unknown> }> = []

  let match
  while ((match = toolCallPattern.exec(content)) !== null) {
    const toolName = match[1]
    const argsStr = match[2].trim()
    try {
      const args = JSON.parse(argsStr)
      matches.push({
        id: `text-tool-call-${Date.now()}-${matches.length}`,
        name: toolName,
        arguments: args
      })
    } catch {
      console.log('Failed to parse tool call arguments:', argsStr)
    }
  }

  return matches.length > 0 ? matches : undefined
}

class LLMService {
  private openaiClients: Map<string, OpenAI> = new Map()
  private anthropicClients: Map<string, Anthropic> = new Map()

  private getOpenAIClient(config: LLMConfig): OpenAI {
    // 生成唯一的缓存键，包含 baseUrl
    const cacheKey = `${config.id}-${config.baseUrl || 'default'}`
    if (!this.openaiClients.has(cacheKey)) {
      this.openaiClients.set(cacheKey, new OpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseUrl || undefined,
        fetch: customFetch
      }))
    }
    return this.openaiClients.get(cacheKey)!
  }

  private getAnthropicClient(config: LLMConfig): Anthropic {
    if (!this.anthropicClients.has(config.id)) {
      this.anthropicClients.set(config.id, new Anthropic({
        apiKey: config.apiKey,
        fetch: customFetch
      }))
    }
    return this.anthropicClients.get(config.id)!
  }

  async chat(
    messages: ChatMessage[],
    tools: Tool[],
    configId?: string,
    onStream?: StreamCallback
  ): Promise<{
    content: string
    toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>
  }> {
    const config = configId
      ? llmStorage.getById(configId)
      : llmStorage.getDefault()

    if (!config) {
      throw new Error('No LLM configuration found')
    }

    // 使用全局系统提示词
    let messagesWithSystem = messages
    const globalSystemPrompt = settingsStorage.getSystemPrompt()
    if (globalSystemPrompt) {
      // 检查是否已有系统消息
      const hasSystemMessage = messages.some(m => m.role === 'system')
      if (!hasSystemMessage) {
        messagesWithSystem = [
          { role: 'system', content: globalSystemPrompt },
          ...messages
        ]
      }
    }

    if (config.provider === 'openai' || config.provider === 'openai-compatible') {
      return this.chatOpenAI(config, messagesWithSystem, tools, onStream)
    } else {
      return this.chatAnthropic(config, messagesWithSystem, tools, onStream)
    }
  }

  private async chatOpenAI(
    config: LLMConfig,
    messages: ChatMessage[],
    tools: Tool[],
    onStream?: StreamCallback
  ): Promise<{
    content: string
    toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>
  }> {
    const client = this.getOpenAIClient(config)

    const openaiTools = tools.length > 0
      ? tools.map(tool => ({
          type: 'function' as const,
          function: {
            name: tool.name,
            description: tool.description || '',
            parameters: tool.inputSchema as Record<string, unknown>
          }
        }))
      : undefined

    console.log('OpenAI request - Tools count:', openaiTools?.length || 0)
    if (openaiTools && openaiTools.length > 0) {
      console.log('OpenAI tools:', JSON.stringify(openaiTools, null, 2))
    }

    // 构建 OpenAI 消息格式
    // 对于 openai-compatible 提供商，使用兼容模式（将工具调用转换为文本格式）
    const isCompatibleMode = config.provider === 'openai-compatible'

    const openaiMessages: OpenAI.ChatCompletionMessageParam[] = []
    for (const m of messages) {
      if (m.role === 'tool') {
        if (isCompatibleMode) {
          // 兼容模式：将工具结果转换为 user 消息
          openaiMessages.push({
            role: 'user' as const,
            content: `[Tool Result] The tool returned:\n${m.content}`
          })
        } else {
          // 标准模式：使用 tool role
          openaiMessages.push({
            role: 'tool' as const,
            content: m.content,
            tool_call_id: m.tool_call_id!
          })
        }
      } else if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0) {
        if (isCompatibleMode) {
          // 兼容模式：将工具调用转换为 assistant 文本消息
          const toolCallsText = m.tool_calls.map(tc =>
            `[Calling Tool: ${tc.name}]\nArguments: ${JSON.stringify(tc.arguments, null, 2)}`
          ).join('\n\n')
          openaiMessages.push({
            role: 'assistant' as const,
            content: (m.content || '') + '\n\n' + toolCallsText
          })
        } else {
          // 标准模式：使用 tool_calls
          openaiMessages.push({
            role: 'assistant' as const,
            content: m.content || null,
            tool_calls: m.tool_calls.map(tc => ({
              id: tc.id,
              type: 'function' as const,
              function: {
                name: tc.name,
                arguments: JSON.stringify(tc.arguments)
              }
            }))
          })
        }
      } else {
        // 普通消息
        openaiMessages.push({
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content
        })
      }
    }

    // Debug: 打印发送给 API 的消息
    console.log('OpenAI messages to send:', JSON.stringify(openaiMessages, null, 2))

    if (onStream) {
      const stream = await client.chat.completions.create({
        model: config.model,
        messages: openaiMessages,
        tools: openaiTools,
        temperature: config.temperature,
        max_tokens: config.maxTokens,
        stream: true
      })

      let content = ''
      const toolCalls: Array<{ id: string; name: string; arguments: string }> = []
      let chunkCount = 0

      for await (const chunk of stream) {
        chunkCount++
        const delta = chunk.choices[0]?.delta
        const finishReason = chunk.choices[0]?.finish_reason

        // 日志每个 chunk 的内容
        if (chunkCount <= 3 || finishReason) {
          console.log(`Chunk ${chunkCount}:`, JSON.stringify({
            delta,
            finishReason
          }))
        }

        if (delta?.content) {
          content += delta.content
          onStream(delta.content)
        }

        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            // 兼容两种格式：有 index 的标准 OpenAI 格式，和无 index 的兼容 API 格式
            const index = tc.index ?? toolCalls.length
            if (!toolCalls[index]) {
              toolCalls[index] = { id: tc.id || '', name: tc.function?.name || '', arguments: '' }
            }
            if (tc.id) toolCalls[index].id = tc.id
            if (tc.function?.name) toolCalls[index].name = tc.function.name
            if (tc.function?.arguments) toolCalls[index].arguments += tc.function.arguments
          }
        }
      }

      console.log('OpenAI stream done - Total chunks:', chunkCount)
      console.log('OpenAI stream done - Tool calls parsed:', toolCalls.length)
      if (toolCalls.length > 0) {
        console.log('Parsed tool calls:', JSON.stringify(toolCalls, null, 2))
      }

      // 如果有实际的 tool_calls，使用它们
      if (toolCalls.length > 0) {
        return {
          content,
          toolCalls: toolCalls.map(tc => ({
            id: tc.id,
            name: tc.name,
            arguments: JSON.parse(tc.arguments || '{}')
          }))
        }
      }

      // 兼容模式：如果没有 tool_calls，尝试从文本内容中解析
      if (isCompatibleMode && content) {
        const textToolCalls = parseTextToolCalls(content)
        if (textToolCalls) {
          console.log('Parsed text tool calls:', JSON.stringify(textToolCalls, null, 2))
          // 从 content 中移除工具调用文本
          const cleanContent = content.replace(/\[Calling Tool:[\s\S]*$/g, '').trim()
          return {
            content: cleanContent,
            toolCalls: textToolCalls
          }
        }
      }

      return { content, toolCalls: undefined }
    } else {
      const response = await client.chat.completions.create({
        model: config.model,
        messages: openaiMessages,
        tools: openaiTools,
        temperature: config.temperature,
        max_tokens: config.maxTokens
      })

      const choice = response.choices[0]
      return {
        content: choice.message.content || '',
        toolCalls: choice.message.tool_calls?.map(tc => ({
          id: tc.id,
          name: tc.function.name,
          arguments: JSON.parse(tc.function.arguments)
        }))
      }
    }
  }

  private async chatAnthropic(
    config: LLMConfig,
    messages: ChatMessage[],
    tools: Tool[],
    onStream?: StreamCallback
  ): Promise<{
    content: string
    toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>
  }> {
    const client = this.getAnthropicClient(config)

    const anthropicTools = tools.length > 0
      ? tools.map(tool => ({
          name: tool.name,
          description: tool.description || '',
          input_schema: tool.inputSchema as Anthropic.Tool['input_schema']
        }))
      : undefined

    // Separate system message
    const systemMessage = messages.find(m => m.role === 'system')?.content
    const chatMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content
      }))

    if (onStream) {
      const stream = await client.messages.stream({
        model: config.model,
        max_tokens: config.maxTokens,
        system: systemMessage,
        messages: chatMessages,
        tools: anthropicTools
      })

      let content = ''
      const toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }> = []

      for await (const event of stream) {
        if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            content += event.delta.text
            onStream(event.delta.text)
          }
        }
        if (event.type === 'content_block_stop') {
          // Check for tool use in the final message
        }
      }

      const finalMessage = await stream.finalMessage()
      for (const block of finalMessage.content) {
        if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id,
            name: block.name,
            arguments: block.input as Record<string, unknown>
          })
        }
      }

      return {
        content,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined
      }
    } else {
      const response = await client.messages.create({
        model: config.model,
        max_tokens: config.maxTokens,
        system: systemMessage,
        messages: chatMessages,
        tools: anthropicTools
      })

      let content = ''
      const toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }> = []

      for (const block of response.content) {
        if (block.type === 'text') {
          content += block.text
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id,
            name: block.name,
            arguments: block.input as Record<string, unknown>
          })
        }
      }

      return {
        content,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined
      }
    }
  }
}

export const llmService = new LLMService()
