/* eslint-disable @typescript-eslint/no-require-imports */

import { render } from '@testing-library/react-native'
import { View } from 'react-native'

const mockBlurView = jest.fn(({ children }) => <View testID="blur-view">{children}</View>)

jest.mock('expo-blur', () => ({
  BlurView: mockBlurView,
}))

const { GlassSurface } = require('@/components/glass-surface')

describe('GlassSurface', () => {
  it('uses the non-native fallback when requested', () => {
    const { queryByTestId } = render(<GlassSurface forceFallback />)

    expect(queryByTestId('blur-view')).not.toBeNull()
    expect(mockBlurView).toHaveBeenCalled()
  })
})
