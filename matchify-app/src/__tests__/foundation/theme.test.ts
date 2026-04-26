import {
  Blur,
  Colors,
  Motion,
  Radius,
  Spacing,
  Typography,
} from '@/constants/theme'

describe('theme tokens', () => {
  it('exports the liquid glass style guide tokens from one module', () => {
    expect(Colors.background).toBe('#08080C')
    expect(Colors.glass).toBe('rgba(255,255,255,0.07)')
    expect(Colors.brand).toBe('#BF5AF2')
    expect(Colors.like).toBe('#30D158')
    expect(Colors.skip).toBe('#FF453A')

    expect(Spacing.four).toBe(24)
    expect(Radius.full).toBe(9999)
    expect(Blur.regular).toBe(24)
    expect(Typography.display).toMatchObject({
      fontSize: 56,
      fontWeight: '700',
      lineHeight: 60,
    })
    expect(Motion.spring).toEqual({
      mass: 1,
      damping: 18,
      stiffness: 200,
    })
    expect(Motion.transition.duration).toBe(250)
  })
})
