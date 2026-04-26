import { GlassView } from '@/components/ui/glass-view'

describe('GlassView', () => {
  it('exports the shared liquid glass component', () => {
    expect(GlassView).toEqual(expect.any(Function))
  })
})
