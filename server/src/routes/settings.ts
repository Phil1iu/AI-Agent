import { Router } from 'express'
import { settingsStorage } from '../storage/index.js'

const router = Router()

// Get settings
router.get('/', (req, res) => {
  const settings = settingsStorage.get()
  res.json(settings)
})

// Update settings
router.put('/', (req, res) => {
  const { systemPrompt } = req.body
  settingsStorage.setSystemPrompt(systemPrompt || undefined)
  res.json(settingsStorage.get())
})

// Get system prompt only
router.get('/system-prompt', (req, res) => {
  const systemPrompt = settingsStorage.getSystemPrompt()
  res.json({ systemPrompt: systemPrompt || '' })
})

// Update system prompt only
router.put('/system-prompt', (req, res) => {
  const { systemPrompt } = req.body
  settingsStorage.setSystemPrompt(systemPrompt || undefined)
  res.json({ systemPrompt: systemPrompt || '' })
})

export default router
