import { useState, useEffect } from 'react'
import { llmApi, LLMConfig, LLMTestResult } from '../services/api'

type ProviderType = 'openai' | 'anthropic' | 'openai-compatible'

export default function LLMConfigPage() {
  const [configs, setConfigs] = useState<LLMConfig[]>([])
  const [models, setModels] = useState<Record<string, { id: string; name: string }[]>>({})
  const [showForm, setShowForm] = useState(false)
  const [editingConfig, setEditingConfig] = useState<LLMConfig | null>(null)
  const [loading, setLoading] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<LLMTestResult | null>(null)
  const [testingConfigId, setTestingConfigId] = useState<string | null>(null)

  const [form, setForm] = useState({
    name: '',
    provider: 'openai' as ProviderType,
    apiKey: '',
    baseUrl: '',
    model: '',
    customModel: '',
    temperature: 0.7,
    maxTokens: 4096,
    isDefault: false
  })

  useEffect(() => {
    loadConfigs()
    loadModels()
  }, [])

  const loadConfigs = async () => {
    const data = await llmApi.getConfigs()
    setConfigs(data)
  }

  const loadModels = async () => {
    const data = await llmApi.getModels()
    setModels(data)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const finalModel = form.provider === 'openai-compatible'
        ? form.customModel
        : form.model

      const config = {
        name: form.name,
        provider: form.provider,
        apiKey: form.apiKey,
        baseUrl: form.baseUrl || undefined,
        model: finalModel,
        temperature: form.temperature,
        maxTokens: form.maxTokens,
        isDefault: form.isDefault
      }

      if (editingConfig) {
        await llmApi.updateConfig(editingConfig.id, config)
      } else {
        await llmApi.createConfig(config)
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

  const handleTest = async () => {
    const finalModel = form.provider === 'openai-compatible'
      ? form.customModel
      : form.model

    if (!finalModel) {
      alert('请先选择或输入模型')
      return
    }

    // 对于非 openai-compatible，需要 API Key
    if (form.provider !== 'openai-compatible' && !form.apiKey && !editingConfig) {
      alert('请输入 API Key')
      return
    }

    setTesting(true)
    setTestResult(null)

    try {
      // 如果是编辑模式且 apiKey 未修改，使用已保存配置的测试
      if (editingConfig && !form.apiKey) {
        const result = await llmApi.testConfigById(editingConfig.id)
        setTestResult(result)
      } else {
        const result = await llmApi.testConfig({
          provider: form.provider,
          apiKey: form.apiKey,
          baseUrl: form.baseUrl || undefined,
          model: finalModel
        })
        setTestResult(result)
      }
    } catch (error) {
      setTestResult({
        success: false,
        error: String(error)
      })
    } finally {
      setTesting(false)
    }
  }

  const handleTestExisting = async (id: string) => {
    setTestingConfigId(id)
    try {
      const result = await llmApi.testConfigById(id)
      if (result.success) {
        alert(`测试成功: ${result.response}`)
      } else {
        alert(`测试失败: ${result.error}`)
      }
    } catch (error) {
      alert(`测试失败: ${error}`)
    } finally {
      setTestingConfigId(null)
    }
  }

  const handleEdit = (config: LLMConfig) => {
    setEditingConfig(config)
    setForm({
      name: config.name,
      provider: config.provider,
      apiKey: '',
      baseUrl: config.baseUrl || '',
      model: config.provider !== 'openai-compatible' ? config.model : '',
      customModel: config.provider === 'openai-compatible' ? config.model : '',
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      isDefault: config.isDefault
    })
    setTestResult(null)
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个配置吗？')) return
    await llmApi.deleteConfig(id)
    await loadConfigs()
  }

  const resetForm = () => {
    setForm({
      name: '',
      provider: 'openai',
      apiKey: '',
      baseUrl: '',
      model: '',
      customModel: '',
      temperature: 0.7,
      maxTokens: 4096,
      isDefault: false
    })
    setTestResult(null)
  }

  const currentModels = models[form.provider] || []
  const isCompatibleMode = form.provider === 'openai-compatible'

  const getProviderLabel = (provider: string) => {
    switch (provider) {
      case 'openai': return 'OpenAI'
      case 'anthropic': return 'Anthropic'
      case 'openai-compatible': return 'OpenAI 兼容'
      default: return provider
    }
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">LLM 配置</h1>
        <button
          onClick={() => {
            setShowForm(true)
            setEditingConfig(null)
            resetForm()
          }}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          添加 LLM 配置
        </button>
      </div>

      {showForm && (
        <div className="bg-white p-6 rounded-lg shadow mb-6">
          <h2 className="text-lg font-semibold mb-4">
            {editingConfig ? '编辑 LLM 配置' : '添加 LLM 配置'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">名称</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full border rounded px-3 py-2"
                placeholder="例如: My GPT-4"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">提供商</label>
              <select
                value={form.provider}
                onChange={e => {
                  setForm({ ...form, provider: e.target.value as ProviderType, model: '', customModel: '' })
                  setTestResult(null)
                }}
                className="w-full border rounded px-3 py-2"
              >
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="openai-compatible">OpenAI 兼容 (自定义 API 地址)</option>
              </select>
            </div>

            {isCompatibleMode && (
              <div>
                <label className="block text-sm font-medium mb-1">API Base URL</label>
                <input
                  type="url"
                  value={form.baseUrl}
                  onChange={e => setForm({ ...form, baseUrl: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  placeholder="例如: https://api.openai.com/v1 或 http://localhost:11434/v1"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  支持 Ollama、LM Studio、vLLM、Azure OpenAI 等兼容 OpenAI API 格式的服务
                </p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1">API Key</label>
              <input
                type="password"
                value={form.apiKey}
                onChange={e => setForm({ ...form, apiKey: e.target.value })}
                className="w-full border rounded px-3 py-2"
                placeholder={editingConfig ? '留空保持不变' : (isCompatibleMode ? '部分服务可留空' : '输入 API Key')}
                required={!editingConfig && !isCompatibleMode}
              />
            </div>

            {isCompatibleMode ? (
              <div>
                <label className="block text-sm font-medium mb-1">模型名称</label>
                <input
                  type="text"
                  value={form.customModel}
                  onChange={e => setForm({ ...form, customModel: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  placeholder="例如: llama2, qwen2.5, deepseek-chat"
                  required
                />
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium mb-1">模型</label>
                <select
                  value={form.model}
                  onChange={e => setForm({ ...form, model: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  required
                >
                  <option value="">选择模型</option>
                  {currentModels.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Temperature</label>
                <input
                  type="number"
                  value={form.temperature}
                  onChange={e => setForm({ ...form, temperature: parseFloat(e.target.value) })}
                  className="w-full border rounded px-3 py-2"
                  min="0"
                  max="2"
                  step="0.1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Max Tokens</label>
                <input
                  type="number"
                  value={form.maxTokens}
                  onChange={e => setForm({ ...form, maxTokens: parseInt(e.target.value) })}
                  className="w-full border rounded px-3 py-2"
                  min="1"
                  max="128000"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isDefault"
                checked={form.isDefault}
                onChange={e => setForm({ ...form, isDefault: e.target.checked })}
                className="rounded"
              />
              <label htmlFor="isDefault" className="text-sm">设为默认配置</label>
            </div>

            {/* 测试结果显示 */}
            {testResult && (
              <div className={`p-3 rounded ${testResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                {testResult.success ? (
                  <div>
                    <div className="text-green-700 font-medium">测试成功</div>
                    <div className="text-green-600 text-sm mt-1">响应: {testResult.response}</div>
                  </div>
                ) : (
                  <div>
                    <div className="text-red-700 font-medium">测试失败</div>
                    <div className="text-red-600 text-sm mt-1">{testResult.error}</div>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleTest}
                disabled={testing || loading}
                className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 disabled:opacity-50"
              >
                {testing ? '测试中...' : '测试连接'}
              </button>
              <button
                type="submit"
                disabled={loading || testing}
                className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
              >
                {loading ? '保存中...' : '保存'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false)
                  setEditingConfig(null)
                  setTestResult(null)
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
            暂无 LLM 配置，点击上方按钮添加
          </div>
        ) : (
          configs.map(config => (
            <div key={config.id} className="bg-white p-4 rounded-lg shadow">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{config.name}</h3>
                    {config.isDefault && (
                      <span className="px-2 py-0.5 text-xs rounded bg-blue-100 text-blue-700">
                        默认
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    提供商: {getProviderLabel(config.provider)} |
                    模型: {config.model}
                  </p>
                  {config.baseUrl && (
                    <p className="text-sm text-gray-500">
                      API 地址: {config.baseUrl}
                    </p>
                  )}
                  <p className="text-sm text-gray-500">
                    Temperature: {config.temperature} | Max Tokens: {config.maxTokens}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleTestExisting(config.id)}
                    disabled={testingConfigId === config.id}
                    className="text-green-600 hover:text-green-700 text-sm disabled:opacity-50"
                  >
                    {testingConfigId === config.id ? '测试中...' : '测试'}
                  </button>
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
          ))
        )}
      </div>
    </div>
  )
}
