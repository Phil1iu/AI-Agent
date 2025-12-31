import { Message, MessagePart } from '../storage/index.js'
import { mcpManager } from './MCPManager.js'
import { llmService } from './LLMService.js'

interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  tool_calls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>
  tool_call_id?: string
}

class AgentService {
  private readonly MAX_ITERATIONS = 10

  async chat(
    messages: Message[],
    llmConfigId?: string,
    onStream?: (chunk: string) => void,
    onToolCall?: (toolCall: { name: string; arguments: Record<string, unknown>; result: unknown }) => void
  ): Promise<{ content: string; parts: MessagePart[] }> {
    // Get available tools from MCP
    const mcpTools = await mcpManager.getAllTools()
    const tools = mcpTools.map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema
    }))

    console.log('=== Agent Chat ===')
    console.log('Available MCP tools:', tools.length)
    if (tools.length > 0) {
      console.log('Tool names:', tools.map(t => t.name).join(', '))
    }

    // Convert messages to chat format
    const chatMessages: ChatMessage[] = messages.map(m => ({
      role: m.role,
      content: m.content
    }))

    let iteration = 0
    const parts: MessagePart[] = []
    let currentTextContent = ''

    while (iteration < this.MAX_ITERATIONS) {
      iteration++

      // Call LLM - 始终使用流式模式以确保一致性
      const response = await llmService.chat(
        chatMessages,
        tools,
        llmConfigId,
        onStream // 所有迭代都使用流式模式
      )

      console.log('LLM Response - Content length:', response.content?.length || 0)
      console.log('LLM Response - Tool calls:', response.toolCalls?.length || 0)
      if (response.toolCalls) {
        console.log('Tool calls:', JSON.stringify(response.toolCalls, null, 2))
      }

      // 如果有文本内容，添加到 parts
      if (response.content) {
        currentTextContent += response.content
        parts.push({ type: 'text', text: response.content })
      }

      // If no tool calls, we're done
      if (!response.toolCalls || response.toolCalls.length === 0) {
        break
      }

      // Add assistant message with tool_calls
      chatMessages.push({
        role: 'assistant',
        content: response.content || '',
        tool_calls: response.toolCalls.map(tc => ({
          id: tc.id,
          name: tc.name,
          arguments: tc.arguments
        }))
      })

      // Process each tool call and add results
      for (const toolCall of response.toolCalls) {
        let result: unknown
        try {
          result = await mcpManager.callTool(toolCall.name, toolCall.arguments)
        } catch (error) {
          result = { error: String(error) }
        }

        // 添加工具调用到 parts
        parts.push({
          type: 'tool_call',
          toolCall: {
            id: toolCall.id,
            name: toolCall.name,
            arguments: toolCall.arguments,
            result
          }
        })

        if (onToolCall) {
          onToolCall({
            name: toolCall.name,
            arguments: toolCall.arguments,
            result
          })
        }

        // Add tool result message
        chatMessages.push({
          role: 'tool',
          content: JSON.stringify(result),
          tool_call_id: toolCall.id
        })
      }
    }

    return {
      content: currentTextContent,
      parts
    }
  }
}

export const agentService = new AgentService()
