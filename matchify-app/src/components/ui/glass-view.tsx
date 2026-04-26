import { GlassSurface, type GlassSurfaceProps } from '@/components/glass-surface'

export type GlassViewProps = GlassSurfaceProps

export function GlassView(props: GlassViewProps) {
  return <GlassSurface {...props} />
}
