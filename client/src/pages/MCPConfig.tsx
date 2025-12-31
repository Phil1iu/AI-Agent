import { useState, useEffect } from 'react'
import { mcpApi, MCPServerConfig } from '../services/api'

export default function MCPConfig() {
  const [configs, setConfigs] = useState<MCPServerConfig[]>([])
  const [status, setStatus] = useState<Record<string, { connected: boolean; toolCount: number }>>({})
  const [showForm, setShowForm] = useState(false)
  const [editingConfig, setEditingConfig] = useState<MCPServerConfig | null>(null)
  const [loading, setLoading] = useState(false)
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({})

  const [form, setForm] = useState({
    name: '',
    type: 'stdio' as 'stdio' | 'sse' | 'streamable-http',
    command: '',
    args: '',
    url: '',
    env: ''
  })

  useEffect(() => {
    loadConfigs()
    loadStatus()
  }, [])

  const loadConfigs = async () => {
    const data = await mcpApi.getConfigs()
    setConfigs(data)
  }

  const loadStatus = async () => {
    const data = await mcpApi.getStatus()
    setStatus(data)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const config = {
        name: form.name,
        type: form.type,
        command: form.type === 'stdio' ? form.command : undefined,
        args: form.type === 'stdio' && form.args ? form.args.split(',').map(s => s.trim()) : undefined,
        url: (form.type === 'sse' || form.type === 'streamable-http') ? form.url : undefined,
        env: form.env ? JSON.parse(form.env) : undefined,
        enabled: true
      }

      if (editingConfig) {
        await mcpApi.updateConfig(editingConfig.id, config)
      } else {
        await mcpApi.createConfig(config)
      }

      setShowForm(false)
      setEditingConfig(null)
      resetForm()
      await loadConfigs()
    } catch (error) {
      alert('保存失败: ' + error)
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = (config: MCPServerConfig) => {
    setEditingConfig(config)
    setForm({
      name: config.name,
      type: config.type,
      command: config.command || '',
      args: config.args?.join(', ') || '',
      url: config.url || '',
      env: config.env ? JSON.stringify(config.env, null, 2) : ''
    })
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个配置吗？')) return
    await mcpApi.deleteConfig(id)
    await loadConfigs()
    await loadStatus()
  }

  const handleConnect = async (id: string) => {
    setLoading(true)
    try {
      await mcpApi.connect(id)
      await loadStatus()
    } catch (error) {
      alert('连接失败: ' + error)
    } finally {
      setLoading(false)
    }
  }

  const handleDisconnect = async (id: string) => {
    setLoading(true)
    try {
      await mcpApi.disconnect(id)
      await loadStatus()
    } catch (error) {
      alert('断开失败: ' + error)
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setForm({
      name: '',
      type: 'stdio',
      command: '',
      args: '',
      url: '',
      env: ''
    })
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">MCP 配置</h1>
        <button
          onClick={() => {
            setShowForm(true)
            setEditingConfig(null)
            resetForm()
          }}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          添加 MCP 服务器
        </button>
      </div>

      {showForm && (
        <div className="bg-white p-6 rounded-lg shadow mb-6">
          <h2 className="text-lg font-semibold mb-4">
            {editingConfig ? '编辑 MCP 服务器' : '添加 MCP 服务器'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">名称</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full border rounded px-3 py-2"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">类型</label>
              <select
                value={form.type}
                onChange={e => setForm({ ...form, type: e.target.value as 'stdio' | 'sse' | 'streamable-http' })}
                className="w-full border rounded px-3 py-2"
              >
                <option value="stdio">Stdio (本地进程)</option>
                <option value="sse">SSE (HTTP Server-Sent Events)</option>
                <option value="streamable-http">Streamable HTTP (新版)</option>
              </select>
            </div>

            {form.type === 'stdio' ? (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1">命令</label>
                  <input
                    type="text"
                    value={form.command}
                    onChange={e => setForm({ ...form, command: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                    placeholder="例如: npx, python, node"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">参数 (逗号分隔)</label>
                  <input
                    type="text"
                    value={form.args}
                    onChange={e => setForm({ ...form, args: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                    placeholder="例如: -y, @anthropic/mcp-server-filesystem"
                  />
                </div>
              </>
            ) : (
              <div>
                <label className="block text-sm font-medium mb-1">URL</label>
                <input
                  type="url"
                  value={form.url}
                  onChange={e => setForm({ ...form, url: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  placeholder={form.type === 'sse' ? "例如: http://localhost:8080/sse" : "例如: http://localhost:8080/mcp"}
                  required
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1">环境变量 (JSON 格式, 可选)</label>
              <textarea
                value={form.env}
                onChange={e => setForm({ ...form, env: e.target.value })}
                className="w-full border rounded px-3 py-2 font-mono text-sm"
                rows={3}
                placeholder='{"API_KEY": "xxx"}'
              />
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={loading}
                className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
              >
                {loading ? '保存中...' : '保存'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false)
                  setEditingConfig(null)
                }}
                className="bg-gray-200 px-4 py-2 rounded hover:bg-gray-300"
              >
                取消
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-4">
        {configs.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            暂无 MCP 服务器配置，点击上方按钮添加
          </div>
        ) : (
          configs.map(config => {
            const isConnected = status[config.id]?.connected
            return (
              <div key={config.id} className="bg-white p-4 rounded-lg shadow">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{config.name}</h3>
                      <span className={`px-2 py-0.5 text-xs rounded ${
                        isConnected ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {isConnected
                          ? `已连接 (${status[config.id].toolCount} 工具)`
                          : config.tools?.length
                            ? `未连接 (${config.tools.length} 工具可用)`
                            : '未连接'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      类型: {config.type === 'stdio' ? 'Stdio' : config.type === 'sse' ? 'SSE' : 'Streamable HTTP'}
                      {config.type === 'stdio' && config.command && ` | 命令: ${config.command}`}
                      {(config.type === 'sse' || config.type === 'streamable-http') && config.url && ` | URL: ${config.url}`}
                    </p>
                    {config.args && config.args.length > 0 && (
                      <p className="text-sm text-gray-500">参数: {config.args.join(' ')}</p>
                    )}
                    {/* 工具列表折叠区域 */}
                    {config.tools && config.tools.length > 0 && (
                      <div className="mt-2">
                        <button
                          onClick={() => setExpandedTools(prev => ({ ...prev, [config.id]: !prev[config.id] }))}
                          className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                        >
                          <span className={`transform transition-transform ${expandedTools[config.id] ? 'rotate-90' : ''}`}>▶</span>
                          查看工具 ({config.tools.length})
                        </button>
                        {expandedTools[config.id] && (
                          <div className="mt-2 pl-4 border-l-2 border-gray-200 space-y-2">
                            {config.tools.map(tool => (
                              <div key={tool.name} className="text-sm">
                                <span className="font-medium text-gray-700">{tool.name}</span>
                                {tool.description && (
                                  <p className="text-gray-500 text-xs mt-0.5">{tool.description}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {isConnected ? (
                      <button
                        onClick={() => handleDisconnect(config.id)}
                        disabled={loading}
                        className="text-red-600 hover:text-red-700 text-sm"
                      >
                        断开
                      </button>
                    ) : (
                      <button
                        onClick={() => handleConnect(config.id)}
                        disabled={loading}
                        className="text-green-600 hover:text-green-700 text-sm"
                      >
                        连接
                      </button>
                    )}
                    <button
                      onClick={() => handleEdit(config)}
                      className="text-blue-600 hover:text-blue-700 text-sm"
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => handleDelete(config.id)}
                      className="text-red-600 hover:text-red-700 text-sm"
                    >
                      删除
                    </button>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
