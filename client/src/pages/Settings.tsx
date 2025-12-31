import { useState, useEffect } from 'react'
import { settingsApi } from '../services/api'

export default function Settings() {
  const [systemPrompt, setSystemPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    const prompt = await settingsApi.getSystemPrompt()
    setSystemPrompt(prompt || '')
  }

  const handleSave = async () => {
    setLoading(true)
    setSaved(false)
    try {
      await settingsApi.setSystemPrompt(systemPrompt)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (error) {
      alert('保存失败: ' + error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">设置</h1>

      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-4">系统提示词</h2>
        <p className="text-sm text-gray-500 mb-4">
          全局系统提示词会在每次对话开始时发送给 AI，用于设定上下文和角色。此设置对所有 LLM 模型生效。
        </p>

        <textarea
          value={systemPrompt}
          onChange={e => setSystemPrompt(e.target.value)}
          className="w-full border rounded px-3 py-2 font-mono text-sm"
          rows={10}
          placeholder="输入系统提示词，例如：你是一个专业的编程助手，擅长解答技术问题..."
        />

        <div className="flex items-center gap-4 mt-4">
          <button
            onClick={handleSave}
            disabled={loading}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
          >
            {loading ? '保存中...' : '保存'}
          </button>
          {saved && (
            <span className="text-green-600 text-sm">已保存</span>
          )}
        </div>
      </div>
    </div>
  )
}
