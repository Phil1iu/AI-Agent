import { Router, Request, Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { conversationStorage, Conversation, Message } from '../storage/index.js'
import { agentService } from '../services/AgentService.js'

const router = Router()

// Get all conversations
router.get('/conversations', (req, res) => {
  const conversations = conversationStorage.getAll().map(c => ({
    id: c.id,
    title: c.title,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    messageCount: c.messages.length
  }))
  res.json(conversations)
})

// Get conversation by id
router.get('/conversations/:id', (req, res) => {
  const conversation = conversationStorage.getById(req.params.id)
  if (!conversation) {
    return res.status(404).json({ error: 'Conversation not found' })
  }
  res.json(conversation)
})

// Create new conversation
router.post('/conversations', (req, res) => {
  const conversation: Conversation = {
    id: uuidv4(),
    title: req.body.title || 'New Conversation',
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
  conversationStorage.create(conversation)
  res.status(201).json(conversation)
})

// Delete conversation
router.delete('/conversations/:id', (req, res) => {
  const existing = conversationStorage.getById(req.params.id)
  if (!existing) {
    return res.status(404).json({ error: 'Conversation not found' })
  }
  conversationStorage.delete(req.params.id)
  res.status(204).send()
})

// Send message (streaming response)
router.post('/message', async (req: Request, res: Response) => {
  const { conversationId, message, llmConfigId } = req.body

  if (!message) {
    return res.status(400).json({ error: 'Message is required' })
  }

  let conversation = conversationId
    ? conversationStorage.getById(conversationId)
    : null

  // Create new conversation if not exists
  if (!conversation) {
    conversation = {
      id: uuidv4(),
      title: message.substring(0, 50) + (message.length > 50 ? '...' : ''),
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    conversationStorage.create(conversation)
  }

  // Add user message
  const userMessage: Message = {
    role: 'user',
    content: message,
    timestamp: Date.now()
  }
  conversationStorage.addMessage(conversation.id, userMessage)

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  try {
    // Get updated conversation
    const updatedConversation = conversationStorage.getById(conversation.id)!

    // Call agent service
    const result = await agentService.chat(
      updatedConversation.messages,
      llmConfigId,
      (chunk) => {
        res.write(`data: ${JSON.stringify({ type: 'content', content: chunk })}\n\n`)
      },
      (toolCall) => {
        res.write(`data: ${JSON.stringify({ type: 'tool_call', ...toolCall })}\n\n`)
      }
    )

    // Save assistant message
    const assistantMessage: Message = {
      role: 'assistant',
      content: result.content,
      parts: result.parts.length > 0 ? result.parts : undefined,
      timestamp: Date.now()
    }
    conversationStorage.addMessage(conversation.id, assistantMessage)

    res.write(`data: ${JSON.stringify({
      type: 'done',
      conversationId: conversation.id,
      message: assistantMessage
    })}\n\n`)
    res.end()
  } catch (error) {
    console.error('Chat error:', error)
    res.write(`data: ${JSON.stringify({ type: 'error', error: String(error) })}\n\n`)
    res.end()
  }
})

export default router
