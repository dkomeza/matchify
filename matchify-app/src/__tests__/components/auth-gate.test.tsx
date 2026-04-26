/* eslint-disable @typescript-eslint/no-require-imports */

import { render } from '@testing-library/react-native'

const mockUseSegments = jest.fn(() => [])
const mockUseQuery = jest.fn(() => [{ data: undefined, error: undefined }])

const mockStack = jest.fn(({ children }) => {
  const { View } = require('react-native')

  return <View testID="stack">{children}</View>
}) as jest.Mock & {
  Screen: jest.Mock
}
mockStack.Screen = jest.fn(() => null)

jest.mock('expo-router', () => {
  const { View } = require('react-native')

  return {
    Redirect: jest.fn(({ href }) => <View testID="redirect" href={href} />),
    Stack: mockStack,
    useSegments: () => mockUseSegments(),
  }
})

jest.mock('urql', () => ({
  gql: jest.fn((strings: TemplateStringsArray) => strings.join('')),
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}))

jest.mock('@/components/splash-screen', () => ({
  SplashScreen: jest.fn(() => {
    const { View } = require('react-native')

    return <View testID="splash-screen" />
  }),
}))

const { AuthGate } = require('@/components/auth-gate')
const { useAuthStore } = require('@/store/auth-store')

beforeEach(() => {
  jest.clearAllMocks()
  mockUseSegments.mockReturnValue([])
  mockUseQuery.mockReturnValue([{ data: undefined, error: undefined }])
  useAuthStore.setState({
    token: null,
    user: null,
    isLoading: true,
    initialize: jest.fn(async () => undefined),
  })
})

describe('AuthGate', () => {
  it('keeps the router stack mounted while auth is loading', () => {
    const { queryByTestId } = render(<AuthGate />)

    expect(queryByTestId('stack')).not.toBeNull()
    expect(queryByTestId('splash-screen')).toBeNull()
  })
})
