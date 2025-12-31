import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { MCPServerConfig, MCPTool, mcpStorage } from '../storage/index.js'

interface MCPConnection {
  client: Client
  config: MCPServerConfig
  tools: MCPTool[]
}

class MCPManager {
  private connections: Map<string, MCPConnection> = new Map()

  async connect(config: MCPServerConfig): Promise<void> {
    if (this.connections.has(config.id)) {
      await this.disconnect(config.id)
    }

    const client = new Client({
      name: 'ai-agent',
      version: '1.0.0'
    }, {
      capabilities: {}
    })

    let transport

    if (config.type === 'stdio' && config.command) {
      transport = new StdioClientTransport({
        command: config.command,
        args: config.args || [],
        env: config.env
      })
    } else if (config.type === 'sse' && config.url) {
      transport = new SSEClientTransport(new URL(config.url))
    } else if (config.type === 'streamable-http' && config.url) {
      transport = new StreamableHTTPClientTransport(new URL(config.url))
    } else {
      throw new Error('Invalid MCP configuration')
    }

    await client.connect(transport)

    // Get tools
    const toolsResult = await client.listTools()
    const tools: MCPTool[] = toolsResult.tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    }))

    this.connections.set(config.id, { client, config, tools })

    // 持久化工具列表到存储
    mcpStorage.update(config.id, { tools })
  }

  async disconnect(configId: string): Promise<void> {
    const connection = this.connections.get(configId)
    if (connection) {
      await connection.client.close()
      this.connections.delete(configId)
    }
  }

  async disconnectAll(): Promise<void> {
    for (const configId of this.connections.keys()) {
      await this.disconnect(configId)
    }
  }

  getStatus(): Record<string, { connected: boolean; toolCount: number }> {
    const status: Record<string, { connected: boolean; toolCount: number }> = {}
    for (const [id, connection] of this.connections) {
      status[id] = {
        connected: true,
        toolCount: connection.tools.length
      }
    }
    return status
  }

  async getAllTools(): Promise<Array<{
    serverId: string
    serverName: string
    name: string
    description?: string
    inputSchema: unknown
  }>> {
    const allTools: Array<{
      serverId: string
      serverName: string
      name: string
      description?: string
      inputSchema: unknown
    }> = []

    for (const [id, connection] of this.connections) {
      for (const tool of connection.tools) {
        allTools.push({
          serverId: id,
          serverName: connection.config.name,
          ...tool
        })
      }
    }

    return allTools
  }

  async callTool(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    // Find the connection that has this tool
    for (const connection of this.connections.values()) {
      const tool = connection.tools.find(t => t.name === toolName)
      if (tool) {
        const result = await connection.client.callTool({
          name: toolName,
          arguments: args
        })
        return result
      }
    }
    throw new Error(`Tool not found: ${toolName}`)
  }

  isConnected(configId: string): boolean {
    return this.connections.has(configId)
  }

  getConnectedIds(): string[] {
    return Array.from(this.connections.keys())
  }
}

export const mcpManager = new MCPManager()
