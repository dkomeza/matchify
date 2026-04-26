import { isAuthFailure } from '@/lib/auth-errors'

describe('isAuthFailure', () => {
  it('matches HTTP 401 responses', () => {
    expect(isAuthFailure({ response: { status: 401 } })).toBe(true)
    expect(isAuthFailure({ networkError: { response: { status: 401 } } })).toBe(true)
  })

  it('matches GraphQL unauthenticated errors', () => {
    expect(isAuthFailure({ graphQLErrors: [{ message: 'UNAUTHENTICATED' }] })).toBe(true)
    expect(isAuthFailure({ graphQLErrors: [{ extensions: { code: 'UNAUTHENTICATED' } }] })).toBe(
      true
    )
  })

  it('does not match transient or server errors', () => {
    expect(isAuthFailure({ response: { status: 500 } })).toBe(false)
    expect(isAuthFailure({ networkError: new Error('Network request failed') })).toBe(false)
    expect(isAuthFailure({ graphQLErrors: [{ message: 'Internal server error' }] })).toBe(false)
  })
})
