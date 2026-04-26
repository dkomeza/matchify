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
import { router } from 'expo-router'

import { getAuthHeaders } from '@/lib/auth-headers'
import { useAuthStore } from '@/store/auth-store'

const API_URL = process.env.EXPO_PUBLIC_API_URL

if (!API_URL) {
  throw new Error('EXPO_PUBLIC_API_URL is not set in .env.local')
}

let unauthorizedRedirect: Promise<void> | null = null

const handleUnauthorized = () => {
  unauthorizedRedirect ??= (async () => {
    useAuthStore.getState().logout()
    router.replace('/welcome')
    unauthorizedRedirect = null
  })()
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
      headers,
    },
  })
}

const isUnauthorizedResult = (error: unknown) => {
  if (!error || typeof error !== 'object') return false

  const response = 'response' in error ? error.response : undefined
  if (response && typeof response === 'object' && 'status' in response) {
    return response.status === 401
  }

  return false
}

export const authExchange = mapExchange({
  onOperation: withAuthHeader,
  onError(error) {
    if (isUnauthorizedResult(error)) {
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

export const urqlClient = createClient({
  url: `${API_URL}/graphql`,
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
})
