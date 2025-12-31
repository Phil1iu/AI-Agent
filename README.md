# AI Agent 项目文档

## 项目概述

AI Agent 是一个支持 MCP (Model Context Protocol) 的 AI 对话应用，提供 LLM 配置管理、MCP 服务器管理和智能对话功能。

## 技术栈

- **前端**: React + TypeScript + Vite + TailwindCSS + React-Markdown
- **后端**: Node.js + Express + TypeScript
- **存储**: 本地 JSON 文件存储
- **LLM 支持**: OpenAI、Anthropic、OpenAI 兼容 API
- **MCP 支持**: Stdio、SSE、Streamable HTTP 三种传输方式

## 项目结构

```
AI Agent/
├── client/                     # 前端项目
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Chat.tsx        # 对话页面
│   │   │   ├── MCPConfig.tsx   # MCP 配置页面
│   │   │   ├── LLMConfig.tsx   # LLM 配置页面
│   │   │   └── Settings.tsx    # 设置页面
│   │   ├── services/
│   │   │   └── api.ts          # API 接口定义
│   │   └── App.tsx             # 路由配置
│   └── package.json
│
├── server/                     # 后端项目
│   ├── src/
│   │   ├── routes/
│   │   │   ├── mcp.ts          # MCP 相关路由
│   │   │   ├── llm.ts          # LLM 相关路由
│   │   │   ├── chat.ts         # 对话路由
│   │   │   └── settings.ts     # 设置路由
│   │   ├── services/
│   │   │   ├── MCPManager.ts   # MCP 连接管理
│   │   │   ├── LLMService.ts   # LLM 调用服务
│   │   │   └── AgentService.ts # Agent 服务（工具调用循环）
│   │   ├── storage/
│   │   │   └── index.ts        # 数据存储层
│   │   └── index.ts            # 服务入口
│   ├── config/                 # 配置文件存储目录
│   │   ├── mcp.json
│   │   ├── llm.json
│   │   └── settings.json
│   └── data/                   # 数据文件存储目录
│       └── conversations.json
│
└── package.json                # 根目录 monorepo 配置
```

## 核心功能

### 1. MCP 服务器管理

**功能特性:**
- 支持三种传输方式：Stdio（本地进程）、SSE、Streamable HTTP
- 服务器启动时自动连接已启用的 MCP 服务器
- 工具列表持久化存储，断开后仍可查看
- 可视化展示每个 MCP 服务器提供的工具

**数据结构:**
```typescript
interface MCPServerConfig {
  id: string
  name: string
  type: 'stdio' | 'sse' | 'streamable-http'
  command?: string        // stdio 类型
  args?: string[]         // stdio 类型参数
  url?: string            // sse/streamable-http 类型
  env?: Record<string, string>
  enabled: boolean
  tools?: MCPTool[]       // 持久化的工具列表
}

interface MCPTool {
  name: string
  description?: string
  inputSchema: unknown
}
```

### 2. LLM 配置管理

**功能特性:**
- 支持 OpenAI、Anthropic、OpenAI 兼容 API 三种提供商
- OpenAI 兼容模式支持自定义 API 地址（Ollama、LM Studio、vLLM 等）
- 可配置 Temperature、Max Tokens 等参数
- 支持设置默认配置
- 连接测试功能

**数据结构:**
```typescript
interface LLMConfig {
  id: string
  name: string
  provider: 'openai' | 'anthropic' | 'openai-compatible'
  apiKey: string
  baseUrl?: string        // 自定义 API 地址
  model: string
  temperature: number
  maxTokens: number
  isDefault: boolean
}
```

### 3. 全局设置

**功能特性:**
- 全局系统提示词配置，对所有 LLM 模型生效
- 独立设置页面管理

**数据结构:**
```typescript
interface Settings {
  systemPrompt?: string
}
```

### 4. 对话功能

**功能特性:**
- 对话列表管理（创建、删除）
- 消息流式输出
- MCP 工具调用支持（自动循环调用直到完成）
- **Markdown 渲染**：助手消息支持完整的 Markdown 格式，包括代码高亮
- **工具调用交错显示**：MCP 工具调用按实际发生顺序穿插在文本内容中
- 用户消息编辑和复制功能
- 编辑消息时从该位置重新发送

**消息编辑功能:**
- 点击"编辑"按钮将消息内容加载到输入框
- 显示黄色提示条表示正在编辑模式
- 发送按钮变为"重新发送"
- 发送时截断编辑位置之后的消息并重新生成回复

**消息数据结构:**
```typescript
interface MessagePart {
  type: 'text' | 'tool_call'
  text?: string              // type='text' 时的文本内容
  toolCall?: {               // type='tool_call' 时的工具调用信息
    id: string
    name: string
    arguments: Record<string, unknown>
    result?: unknown
  }
}

interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string            // 用户消息的完整内容，助手消息的纯文本摘要
  parts?: MessagePart[]      // 助手消息的交错内容（文本和工具调用按顺序排列）
  timestamp: number
}
```

**工具调用显示逻辑:**
- 历史消息：从 `parts` 数组按顺序渲染，工具调用穿插在文本之间
- 实时流式：收到 `content` 时追加到当前 text part，收到 `tool_call` 时添加新 part
- 工具调用显示为可折叠的详情面板，包含参数和结果

## API 接口

### MCP API (`/api/mcp`)
- `GET /configs` - 获取所有 MCP 配置
- `POST /configs` - 创建 MCP 配置
- `PUT /configs/:id` - 更新 MCP 配置
- `DELETE /configs/:id` - 删除 MCP 配置
- `POST /connect/:id` - 连接 MCP 服务器
- `POST /disconnect/:id` - 断开 MCP 服务器
- `GET /status` - 获取连接状态
- `GET /tools` - 获取所有已连接服务器的工具

### LLM API (`/api/llm`)
- `GET /configs` - 获取所有 LLM 配置
- `POST /configs` - 创建 LLM 配置
- `PUT /configs/:id` - 更新 LLM 配置
- `DELETE /configs/:id` - 删除 LLM 配置
- `GET /models` - 获取可用模型列表
- `POST /test` - 测试未保存的配置
- `POST /test/:id` - 测试已保存的配置

### Chat API (`/api/chat`)
- `GET /conversations` - 获取对话列表
- `GET /conversations/:id` - 获取对话详情
- `POST /conversations` - 创建对话
- `DELETE /conversations/:id` - 删除对话
- `POST /message` - 发送消息（SSE 流式响应）

### Settings API (`/api/settings`)
- `GET /` - 获取设置
- `PUT /` - 更新设置
- `GET /system-prompt` - 获取系统提示词
- `PUT /system-prompt` - 更新系统提示词

## 关键实现

### 1. OpenAI 兼容 API 工具调用兼容性

部分 OpenAI 兼容 API（如通过代理的 Gemini）返回的 tool_calls 没有 index 字段。解决方案：

```typescript
// LLMService.ts
if (delta?.tool_calls) {
  for (const tc of delta.tool_calls) {
    // 兼容两种格式：有 index 的标准 OpenAI 格式，和无 index 的兼容 API 格式
    const index = tc.index ?? toolCalls.length
    if (!toolCalls[index]) {
      toolCalls[index] = { id: tc.id || '', name: tc.function?.name || '', arguments: '' }
    }
    // ... 累积参数
  }
}
```

### 2. MCP 服务器自动连接

服务启动时自动连接已启用的 MCP 服务器：

```typescript
// server/src/index.ts
async function autoConnectMCP() {
  const configs = mcpStorage.getAll().filter(c => c.enabled)
  for (const config of configs) {
    try {
      await mcpManager.connect(config)
      console.log(`✓ Connected to MCP: ${config.name}`)
    } catch (error) {
      console.error(`✗ Failed to connect MCP "${config.name}":`, error)
    }
  }
}

app.listen(PORT, () => {
  autoConnectMCP()
})
```

### 3. MCP 工具列表持久化

连接成功后将工具列表保存到存储：

```typescript
// MCPManager.ts
async connect(config: MCPServerConfig): Promise<void> {
  // ... 连接逻辑
  const toolsResult = await client.listTools()
  const tools = toolsResult.tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema
  }))

  this.connections.set(config.id, { client, config, tools })
  // 持久化工具列表到存储
  mcpStorage.update(config.id, { tools })
}
```

### 4. Windows DNS 解析优化

解决 Windows 下 DNS 解析超时问题：

```typescript
// server/src/index.ts
import dns from 'dns'
dns.setDefaultResultOrder('ipv4first')
```

### 5. OpenAI 兼容模式工具调用

部分 OpenAI 兼容 API（如 Gemini 代理）不支持标准的 `role: "tool"` 消息格式。解决方案是将工具调用和结果转换为文本格式：

```typescript
// LLMService.ts
const isCompatibleMode = config.provider === 'openai-compatible'

// 工具结果转换为 user 消息
if (m.role === 'tool') {
  if (isCompatibleMode) {
    openaiMessages.push({
      role: 'user',
      content: `[Tool Result] The tool returned:\n${m.content}`
    })
  }
}

// 工具调用转换为 assistant 文本消息
if (m.role === 'assistant' && m.tool_calls) {
  if (isCompatibleMode) {
    const toolCallsText = m.tool_calls.map(tc =>
      `[Calling Tool: ${tc.name}]\nArguments: ${JSON.stringify(tc.arguments, null, 2)}`
    ).join('\n\n')
    openaiMessages.push({
      role: 'assistant',
      content: (m.content || '') + '\n\n' + toolCallsText
    })
  }
}
```

### 6. 文本格式工具调用解析

兼容模式下 LLM 可能输出文本格式的工具调用而非 `tool_calls`，需要从文本中解析：

```typescript
// LLMService.ts
function parseTextToolCalls(content: string) {
  const toolCallPattern = /\[Calling Tool:\s*(\w+)\]\s*Arguments:\s*(\{[\s\S]*?\}(?=\s*\[Calling Tool:|\s*$))/g
  const matches = []
  let match
  while ((match = toolCallPattern.exec(content)) !== null) {
    const toolName = match[1]
    const argsStr = match[2].trim()
    try {
      matches.push({
        id: `text-tool-call-${Date.now()}-${matches.length}`,
        name: toolName,
        arguments: JSON.parse(argsStr)
      })
    } catch { /* ignore parse errors */ }
  }
  return matches.length > 0 ? matches : undefined
}

// 解析后从 content 中移除工具调用文本
if (isCompatibleMode && content) {
  const textToolCalls = parseTextToolCalls(content)
  if (textToolCalls) {
    const cleanContent = content.replace(/\[Calling Tool:[\s\S]*$/g, '').trim()
    return { content: cleanContent, toolCalls: textToolCalls }
  }
}
```

### 7. 交错内容构建（AgentService）

Agent 循环调用工具时，按顺序构建 `parts` 数组，记录文本和工具调用的实际发生顺序：

```typescript
// AgentService.ts
async chat(messages, llmConfigId, onStream, onToolCall) {
  const parts: MessagePart[] = []
  let currentTextContent = ''

  while (iteration < this.MAX_ITERATIONS) {
    const response = await llmService.chat(chatMessages, tools, llmConfigId, onStream)

    // 如果有文本内容，添加到 parts
    if (response.content) {
      currentTextContent += response.content
      parts.push({ type: 'text', text: response.content })
    }

    if (!response.toolCalls || response.toolCalls.length === 0) break

    // 处理每个工具调用，添加到 parts
    for (const toolCall of response.toolCalls) {
      const result = await mcpManager.callTool(toolCall.name, toolCall.arguments)

      parts.push({
        type: 'tool_call',
        toolCall: {
          id: toolCall.id,
          name: toolCall.name,
          arguments: toolCall.arguments,
          result
        }
      })

      if (onToolCall) onToolCall({ name: toolCall.name, arguments: toolCall.arguments, result })
    }
  }

  return { content: currentTextContent, parts }
}
```

### 8. 前端流式内容交错显示

实时对话时，将 `content` 和 `tool_call` 事件按到达顺序构建 `streamingParts` 数组：

```typescript
// Chat.tsx
const [streamingParts, setStreamingParts] = useState<MessagePart[]>([])

// 流式处理
const result = await chatApi.sendMessage(userMessage, conversationId, llmConfigId, (data) => {
  if (data.type === 'content' && data.content) {
    // 将内容追加到最后一个 text part，或创建新的 text part
    setStreamingParts(prev => {
      const lastPart = prev[prev.length - 1]
      if (lastPart && lastPart.type === 'text') {
        return [
          ...prev.slice(0, -1),
          { type: 'text', text: (lastPart.text || '') + data.content }
        ]
      } else {
        return [...prev, { type: 'text', text: data.content }]
      }
    })
  } else if (data.type === 'tool_call') {
    // 添加工具调用 part
    setStreamingParts(prev => [...prev, {
      type: 'tool_call',
      toolCall: { id: toolData.name + '-' + Date.now(), name: toolData.name, arguments: toolData.arguments, result: toolData.result }
    }])
  }
})
```

### 9. Markdown 渲染组件

使用 `react-markdown` + `remark-gfm` + `react-syntax-highlighter` 实现 Markdown 渲染：

```typescript
// Chat.tsx
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'

function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="prose prose-sm max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '')
            const isInline = !match && !String(children).includes('\n')
            return isInline ? (
              <code className="bg-gray-100 px-1 py-0.5 rounded text-sm" {...props}>{children}</code>
            ) : (
              <SyntaxHighlighter style={oneDark} language={match ? match[1] : 'text'} PreTag="div">
                {String(children).replace(/\n$/, '')}
              </SyntaxHighlighter>
            )
          },
          // ... 其他元素样式定制
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
```

**支持的 Markdown 特性:**
- GitHub Flavored Markdown（表格、删除线、任务列表等）
- 代码块语法高亮（使用 oneDark 主题）
- 内联代码、列表、链接、表格等

## 代理配置

如果您的网络环境需要通过代理访问外部 API（如 OpenAI、Anthropic 或其他 LLM 服务），需要配置 HTTP 代理环境变量。

### 设置代理

**方法1：临时设置（当前终端会话有效）**

CMD:
```cmd
set HTTPS_PROXY=http://127.0.0.1:10809
set HTTP_PROXY=http://127.0.0.1:10809
```

PowerShell:
```powershell
$env:HTTPS_PROXY = "http://127.0.0.1:10809"
$env:HTTP_PROXY = "http://127.0.0.1:10809"
```

**方法2：永久设置（全局生效）**

CMD（管理员）:
```cmd
setx HTTPS_PROXY "http://127.0.0.1:10809"
setx HTTP_PROXY "http://127.0.0.1:10809"
```

PowerShell（管理员）:
```powershell
[Environment]::SetEnvironmentVariable("HTTPS_PROXY", "http://127.0.0.1:10809", "User")
[Environment]::SetEnvironmentVariable("HTTP_PROXY", "http://127.0.0.1:10809", "User")
```

或通过图形界面：`Win + R` → `sysdm.cpl` → 高级 → 环境变量 → 新建用户变量

### 清除代理

**临时清除（当前会话）**

关闭终端重新打开即可。

**永久清除**

CMD（管理员）:
```cmd
setx HTTPS_PROXY ""
setx HTTP_PROXY ""
```

PowerShell（管理员）:
```powershell
[Environment]::SetEnvironmentVariable("HTTPS_PROXY", $null, "User")
[Environment]::SetEnvironmentVariable("HTTP_PROXY", $null, "User")
```

或通过图形界面删除对应的环境变量。

> **注意：**
> - 设置或清除后需要**重新打开终端**或**重启 VSCode** 才能生效
> - V2rayN 用户请使用 HTTP 代理端口（通常是 `10809`），而不是 SOCKS5 端口（`10808`）
> - Clash 用户通常使用端口 `7890`

## 运行项目

```bash
# 安装依赖
npm install

# 开发模式（同时启动前后端）
npm run dev

# 单独启动
npm run dev:server  # 后端 (localhost:3001)
npm run dev:client  # 前端 (localhost:5173)
```

## 配置文件位置

- MCP 配置: `server/config/mcp.json`
- LLM 配置: `server/config/llm.json`
- 全局设置: `server/config/settings.json`
- 对话数据: `server/data/conversations.json`
