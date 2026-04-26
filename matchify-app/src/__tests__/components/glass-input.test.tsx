/* eslint-disable @typescript-eslint/no-require-imports */

import { fireEvent, render } from '@testing-library/react-native'

import { GlassInput } from '@/components/ui/glass-input'
import { Colors } from '@/constants/theme'

jest.mock('@/components/glass-surface', () => {
  const { View } = require('react-native')

  return {
    GlassSurface: jest.fn(({ children, ...props }) => <View {...props}>{children}</View>),
  }
})

describe('GlassInput', () => {
  it('uses the accent border while focused', () => {
    const { getByPlaceholderText, getByTestId } = render(
      <GlassInput testID="name-input" placeholder="Name" value="" onChangeText={jest.fn()} />
    )

    fireEvent(getByPlaceholderText('Name'), 'focus')

    expect(getByTestId('name-input-shell')).toHaveStyle({
      borderColor: Colors.accent,
      borderWidth: 1.5,
    })
  })
})
