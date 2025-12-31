import { useState, useEffect, useRef } from 'react'
import { chatApi, llmApi, LLMConfig, Message, MessagePart } from '../services/api'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'

// Markdown渲染组件
function MarkdownContent({ content, className = '' }: { content: string; className?: string }) {
  return (
    <div className={`prose prose-sm max-w-none ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '')
            const isInline = !match && !String(children).includes('\n')
            return isInline ? (
              <code className="bg-gray-100 px-1 py-0.5 rounded text-sm" {...props}>
                {children}
              </code>
            ) : (
              <SyntaxHighlighter
                style={oneDark}
                language={match ? match[1] : 'text'}
                PreTag="div"
                className="rounded-md text-sm"
              >
                {String(children).replace(/\n$/, '')}
              </SyntaxHighlighter>
            )
          },
          p({ children }) {
            return <p className="mb-2 last:mb-0">{children}</p>
          },
          ul({ children }) {
            return <ul className="list-disc list-inside mb-2">{children}</ul>
          },
          ol({ children }) {
            return <ol className="list-decimal list-inside mb-2">{children}</ol>
          },
          a({ href, children }) {
            return <a href={href} className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">{children}</a>
          },
          table({ children }) {
            return <table className="border-collapse border border-gray-300 my-2">{children}</table>
          },
          th({ children }) {
            return <th className="border border-gray-300 px-2 py-1 bg-gray-100">{children}</th>
          },
          td({ children }) {
            return <td className="border border-gray-300 px-2 py-1">{children}</td>
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

export default function Chat() {
  const [conversations, setConversations] = useState<Array<{ id: string; title: string }>>([])
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [streamingParts, setStreamingParts] = useState<MessagePart[]>([])
  const [llmConfigs, setLlmConfigs] = useState<LLMConfig[]>([])
  const [selectedLlmId, setSelectedLlmId] = useState<string>('')
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadConversations()
    loadLlmConfigs()
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingParts])

  const loadConversations = async () => {
    const data = await chatApi.getConversations()
    setConversations(data)
  }

  const loadLlmConfigs = async () => {
    const data = await llmApi.getConfigs()
    setLlmConfigs(data)
    const defaultConfig = data.find(c => c.isDefault)
    if (defaultConfig) {
      setSelectedLlmId(defaultConfig.id)
    } else if (data.length > 0) {
      setSelectedLlmId(data[0].id)
    }
  }

  const loadConversation = async (id: string) => {
    const data = await chatApi.getConversation(id)
    setCurrentConversationId(id)
    setMessages(data.messages)
  }

  const handleNewConversation = () => {
    setCurrentConversationId(null)
    setMessages([])
    setStreamingParts([])
  }

  const handleDeleteConversation = async (id: string) => {
    if (!confirm('确定要删除这个对话吗？')) return
    await chatApi.deleteConversation(id)
    if (currentConversationId === id) {
      handleNewConversation()
    }
    await loadConversations()
  }

  const handleSend = async () => {
    if (!input.trim() || loading) return
    if (!selectedLlmId) {
      alert('请先配置 LLM')
      return
    }

    const userMessage = input.trim()
    setInput('')
    setLoading(true)
    setStreamingParts([])

    // If editing, truncate messages to the editing point
    if (editingIndex !== null) {
      setMessages(prev => [...prev.slice(0, editingIndex), {
        role: 'user',
        content: userMessage,
        timestamp: Date.now()
      }])
      setEditingIndex(null)
    } else {
      // Add user message to display immediately
      setMessages(prev => [...prev, {
        role: 'user',
        content: userMessage,
        timestamp: Date.now()
      }])
    }

    try {
      const result = await chatApi.sendMessage(
        userMessage,
        currentConversationId || undefined,
        selectedLlmId,
        (data) => {
          if (data.type === 'content' && data.content) {
            // 将内容追加到最后一个 text part，或创建新的 text part
            setStreamingParts(prev => {
              const lastPart = prev[prev.length - 1]
              if (lastPart && lastPart.type === 'text') {
                // 追加到现有的 text part
                return [
                  ...prev.slice(0, -1),
                  { type: 'text' as const, text: (lastPart.text || '') + data.content }
                ]
              } else {
                // 创建新的 text part
                return [...prev, { type: 'text' as const, text: data.content }]
              }
            })
          } else if (data.type === 'tool_call') {
            // 添加工具调用 part
            const toolData = data as unknown as { name: string; arguments: Record<string, unknown>; result?: unknown }
            setStreamingParts(prev => [...prev, {
              type: 'tool_call' as const,
              toolCall: {
                id: toolData.name + '-' + Date.now(),
                name: toolData.name,
                arguments: toolData.arguments,
                result: toolData.result
              }
            }])
          }
        }
      )

      if (result) {
        setCurrentConversationId(result.conversationId)
        setMessages(prev => [...prev, result.message])
        setStreamingParts([])
        await loadConversations()
      }
    } catch (error) {
      alert('发送失败: ' + error)
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleCopyMessage = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content)
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea')
      textarea.value = content
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }
  }

  const handleEditMessage = (index: number, content: string) => {
    setInput(content)
    setEditingIndex(index)
  }

  const handleCancelEdit = () => {
    setInput('')
    setEditingIndex(null)
  }

  return (
    <div className="flex h-[calc(100vh-56px)]">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r flex flex-col">
        <div className="p-4 border-b">
          <button
            onClick={handleNewConversation}
            className="w-full bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            新对话
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.map(conv => (
            <div
              key={conv.id}
              className={`p-3 cursor-pointer hover:bg-gray-100 flex justify-between items-center ${
                currentConversationId === conv.id ? 'bg-gray-100' : ''
              }`}
              onClick={() => loadConversation(conv.id)}
            >
              <span className="truncate flex-1">{conv.title}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleDeleteConversation(conv.id)
                }}
                className="text-red-500 hover:text-red-700 ml-2"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <div className="p-4 border-t">
          <label className="block text-sm font-medium mb-1">LLM 模型</label>
          <select
            value={selectedLlmId}
            onChange={e => setSelectedLlmId(e.target.value)}
            className="w-full border rounded px-2 py-1 text-sm"
          >
            {llmConfigs.length === 0 && <option value="">请先配置 LLM</option>}
            {llmConfigs.map(config => (
              <option key={config.id} value={config.id}>
                {config.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-3xl rounded-lg px-4 py-2 ${
                msg.role === 'user'
                  ? 'bg-blue-500 text-white'
                  : 'bg-white border'
              }`}>
                {msg.role === 'user' ? (
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                ) : (
                  <>
                    {/* Render interleaved parts if available, otherwise fallback to content */}
                    {msg.parts && msg.parts.length > 0 ? (
                      msg.parts.map((part, partIdx) => (
                        part.type === 'text' && part.text ? (
                          <div key={partIdx} className={partIdx > 0 ? 'mt-2' : ''}>
                            <MarkdownContent content={part.text} />
                          </div>
                        ) : part.type === 'tool_call' && part.toolCall ? (
                          <details key={partIdx} className="my-2 text-xs text-gray-500">
                            <summary className="cursor-pointer hover:text-gray-700 inline-flex items-center gap-1">
                              <span>🔧</span>
                              <span className="font-mono">{part.toolCall.name}</span>
                            </summary>
                            <div className="mt-1 ml-4 p-2 bg-gray-50 rounded border text-xs">
                              <div className="text-gray-600">
                                <span className="font-medium">参数:</span>
                                <pre className="mt-1 p-2 bg-white rounded border overflow-x-auto">
                                  {JSON.stringify(part.toolCall.arguments, null, 2)}
                                </pre>
                              </div>
                              {part.toolCall.result !== undefined && (
                                <div className="text-gray-600 mt-2">
                                  <span className="font-medium">结果:</span>
                                  <pre className="mt-1 p-2 bg-white rounded border overflow-x-auto max-h-40 overflow-y-auto">
                                    {typeof part.toolCall.result === 'string' ? part.toolCall.result : JSON.stringify(part.toolCall.result, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </details>
                        ) : null
                      ))
                    ) : (
                      msg.content && <MarkdownContent content={msg.content} />
                    )}
                  </>
                )}
                {msg.role === 'user' && (
                  <div className="flex justify-end gap-2 mt-1 pt-1 border-t border-blue-400">
                    <button
                      onClick={() => handleCopyMessage(msg.content)}
                      className="text-xs text-blue-200 hover:text-white"
                      title="复制"
                    >
                      复制
                    </button>
                    <button
                      onClick={() => handleEditMessage(idx, msg.content)}
                      className="text-xs text-blue-200 hover:text-white"
                      title="编辑"
                      disabled={loading}
                    >
                      编辑
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Streaming content */}
          {streamingParts.length > 0 && (
            <div className="flex justify-start">
              <div className="max-w-3xl rounded-lg px-4 py-2 bg-white border">
                {streamingParts.map((part, partIdx) => (
                  part.type === 'text' && part.text ? (
                    <div key={partIdx} className={partIdx > 0 ? 'mt-2' : ''}>
                      <MarkdownContent content={part.text} />
                    </div>
                  ) : part.type === 'tool_call' && part.toolCall ? (
                    <details key={partIdx} className="my-2 text-xs text-gray-500" open>
                      <summary className="cursor-pointer hover:text-gray-700 inline-flex items-center gap-1">
                        <span className="animate-pulse">⏳</span>
                        <span className="font-mono">{part.toolCall.name}</span>
                      </summary>
                      <div className="mt-1 ml-4 p-2 bg-gray-50 rounded border text-xs">
                        <div className="text-gray-600">
                          <span className="font-medium">参数:</span>
                          <pre className="mt-1 p-2 bg-white rounded border overflow-x-auto">
                            {JSON.stringify(part.toolCall.arguments, null, 2)}
                          </pre>
                        </div>
                        {part.toolCall.result !== undefined && (
                          <div className="text-gray-600 mt-2">
                            <span className="font-medium">结果:</span>
                            <pre className="mt-1 p-2 bg-white rounded border overflow-x-auto max-h-40 overflow-y-auto">
                              {typeof part.toolCall.result === 'string' ? part.toolCall.result : JSON.stringify(part.toolCall.result, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    </details>
                  ) : null
                ))}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t p-4 bg-white">
          {editingIndex !== null && (
            <div className="flex items-center justify-between mb-2 px-2 py-1 bg-yellow-50 rounded text-sm text-yellow-700">
              <span>正在编辑消息...</span>
              <button
                onClick={handleCancelEdit}
                className="text-yellow-600 hover:text-yellow-800"
              >
                取消编辑
              </button>
            </div>
          )}
          <div className="flex gap-2">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入消息..."
              className="flex-1 border rounded-lg px-4 py-2 resize-none"
              rows={2}
              disabled={loading}
            />
            <button
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? '发送中...' : editingIndex !== null ? '重新发送' : '发送'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
