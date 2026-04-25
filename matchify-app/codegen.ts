import { existsSync, readFileSync } from 'node:fs'
import type { CodegenConfig } from '@graphql-codegen/cli'

const envLocalPath = '.env.local'

if (existsSync(envLocalPath)) {
  for (const line of readFileSync(envLocalPath, 'utf8').split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2]
    }
  }
}

const apiUrl = process.env.EXPO_PUBLIC_API_URL

if (!apiUrl) {
  throw new Error('EXPO_PUBLIC_API_URL is required for GraphQL codegen')
}

const config: CodegenConfig = {
  schema: `${apiUrl}/graphql`,
  documents: ['src/**/*.{ts,tsx}', '!src/lib/graphql/__generated__/**'],
  generates: {
    'src/lib/graphql/__generated__/types.ts': {
      plugins: ['typescript', 'typescript-operations'],
    },
  },
  ignoreNoDocuments: true,
}

export default config
