import {
  cacheExchange,
  createClient,
  fetchExchange,
  makeOperation,
  mapExchange,
  subscriptionExchange,
  type Operation,
  type SubscriptionOperation,
} from 'urql'
import { createClient as createSSEClient, type RequestParams } from 'graphql-sse'

import { isAuthFailure } from '@/lib/auth-errors'
import { useAuthStore } from '@/store/auth-store'

const API_URL = process.env.EXPO_PUBLIC_API_URL

if (!API_URL) {
  throw new Error('EXPO_PUBLIC_API_URL is not set in .env.local')
}

const getAuthHeaders = async (): Promise<Record<string, string>> => {
  const token = useAuthStore.getState().token

  return token ? { Authorization: `Bearer ${token}` } : {}
}

let unauthorizedRedirect: Promise<void> | null = null

export const handleUnauthorized = () => {
  if (unauthorizedRedirect) return

  unauthorizedRedirect = Promise.resolve()
    .then(() => {
      useAuthStore.getState().logout()
    })
    .finally(() => {
      unauthorizedRedirect = null
    })
}

const withAuthHeader = async (operation: Operation) => {
  const fetchOptions =
    typeof operation.context.fetchOptions === 'function'
      ? operation.context.fetchOptions()
      : operation.context.fetchOptions ?? {}
  const headers = new Headers(fetchOptions.headers)
  const authHeaders = await getAuthHeaders()

  if (authHeaders.Authorization) {
    headers.set('Authorization', authHeaders.Authorization)
  } else {
    headers.delete('Authorization')
  }

  return makeOperation(operation.kind, operation, {
    ...operation.context,
    fetchOptions: {
      ...fetchOptions,
      headers: Object.fromEntries(headers.entries()),
    },
  })
}

export const authExchange = mapExchange({
  onOperation: withAuthHeader,
  onError(error) {
    if (isAuthFailure(error)) {
      handleUnauthorized()
    }
  },
})

const sseClient = createSSEClient({
  url: `${API_URL}/graphql/ws`,
  headers: getAuthHeaders,
})

const toSSERequest = (request: SubscriptionOperation): RequestParams => {
  if (!request.query) {
    throw new Error('SSE subscriptions require a printed GraphQL query')
  }

  return {
    query: request.query,
    operationName: request.operationName,
    variables: request.variables,
    extensions: request.extensions,
  }
}

export const urqlClientOptions = {
  url: `${API_URL}/graphql`,
  preferGetMethod: false,
  exchanges: [
    cacheExchange,
    authExchange,
    fetchExchange,
    subscriptionExchange({
      forwardSubscription: (request) => ({
        subscribe: (sink) => {
          const unsubscribe = sseClient.subscribe(toSSERequest(request), sink)

          return { unsubscribe }
        },
      }),
    }),
  ],
} satisfies Parameters<typeof createClient>[0]

export const urqlClient = createClient(urqlClientOptions)
