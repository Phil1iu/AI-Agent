import { Routes, Route, NavLink } from 'react-router-dom'
import Chat from './pages/Chat'
import MCPConfig from './pages/MCPConfig'
import LLMConfig from './pages/LLMConfig'
import Settings from './pages/Settings'

function App() {
  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center space-x-8">
              <span className="text-xl font-bold text-gray-800">AI Agent</span>
              <div className="flex space-x-4">
                <NavLink
                  to="/"
                  className={({ isActive }) =>
                    `px-3 py-2 rounded-md text-sm font-medium ${
                      isActive ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-200'
                    }`
                  }
                >
                  对话
                </NavLink>
                <NavLink
                  to="/mcp"
                  className={({ isActive }) =>
                    `px-3 py-2 rounded-md text-sm font-medium ${
                      isActive ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-200'
                    }`
                  }
                >
                  MCP 配置
                </NavLink>
                <NavLink
                  to="/llm"
                  className={({ isActive }) =>
                    `px-3 py-2 rounded-md text-sm font-medium ${
                      isActive ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-200'
                    }`
                  }
                >
                  LLM 配置
                </NavLink>
                <NavLink
                  to="/settings"
                  className={({ isActive }) =>
                    `px-3 py-2 rounded-md text-sm font-medium ${
                      isActive ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-200'
                    }`
                  }
                >
                  设置
                </NavLink>
              </div>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto">
        <Routes>
          <Route path="/" element={<Chat />} />
          <Route path="/mcp" element={<MCPConfig />} />
          <Route path="/llm" element={<LLMConfig />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
