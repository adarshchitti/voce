import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

// Load .env.local before anything else reads process.env
config({ path: '.env.local' })

export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './src/lib/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
})