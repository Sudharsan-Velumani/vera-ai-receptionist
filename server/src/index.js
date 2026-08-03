import 'dotenv/config'
import { createApp } from './app.js'
import { providers } from './ai/index.js'
import { initDb, targetDialect } from './db/index.js'

const PORT = Number(process.env.PORT) || 4000

// Fail fast locally if the database is unreachable, rather than surfacing it
// as a 500 on the first request.
await initDb()

createApp().listen(PORT, () => {
  const p = providers()
  console.log(`\n  Vera API   http://localhost:${PORT}`)
  console.log(`  Database   ${targetDialect()}${targetDialect() === 'sqlite' ? `  (${process.env.DB_PATH || './data/vera.db'})` : ''}`)
  console.log(`  LLM        ${p.llm}${p.llm === 'mock' ? '  (offline brain — add GROQ_API_KEY to upgrade)' : ''}`)
  console.log(`  STT        ${p.stt}`)
  console.log(`  TTS        ${p.tts}\n`)
})
