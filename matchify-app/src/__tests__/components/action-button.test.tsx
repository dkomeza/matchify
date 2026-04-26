/* eslint-disable @typescript-eslint/no-require-imports */

import { fireEvent, render } from '@testing-library/react-native'
import { withSpring } from 'react-native-reanimated'

import { ActionButton } from '@/components/vote/ActionButton'

jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native')

  return {
    __esModule: true,
    default: {
      View,
    },
    interpolateColor: jest.fn((_value, _input, output) => output[0]),
    useAnimatedStyle: jest.fn((callback) => callback()),
    useSharedValue: jest.fn((value) => ({ value })),
    withSpring: jest.fn((value) => value),
  }
})

jest.mock('@/components/glass-surface', () => {
  const { View } = require('react-native')

  return {
    GlassSurface: jest.fn(({ children, ...props }) => <View {...props}>{children}</View>),
  }
})

describe('ActionButton', () => {
  const mockWithSpring = jest.mocked(withSpring)

  beforeEach(() => {
    mockWithSpring.mockClear()
  })

  it('renders an accessible like button and calls onPress', () => {
    const onPress = jest.fn()
    const { getByLabelText } = render(<ActionButton type="like" onPress={onPress} />)

    fireEvent.press(getByLabelText('Like'))

    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('springs to pressed and released states', () => {
    const { getByLabelText } = render(<ActionButton type="skip" onPress={jest.fn()} />)
    const button = getByLabelText('Skip')

    fireEvent(button, 'pressIn')
    fireEvent(button, 'pressOut')

    expect(mockWithSpring).toHaveBeenCalledWith(0.95, expect.any(Object))
    expect(mockWithSpring).toHaveBeenCalledWith(1, expect.any(Object))
  })

  it('does not animate or press when disabled', () => {
    const onPress = jest.fn()
    const { getByLabelText } = render(<ActionButton type="like" onPress={onPress} disabled />)
    const button = getByLabelText('Like')

    fireEvent(button, 'pressIn')
    fireEvent.press(button)

    expect(onPress).not.toHaveBeenCalled()
    expect(mockWithSpring).not.toHaveBeenCalled()
    expect(button.props.style).toEqual(expect.objectContaining({ opacity: 0.4 }))
  })
})
