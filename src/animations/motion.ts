import type { SpringConfig } from 'remotion'

export const MOTION = {
  spring: {
    smooth: { damping: 200 },
    snappy: { damping: 20, stiffness: 200 },
    bouncy: { damping: 8 },
  },
  duration: {
    fast: 15,
    normal: 30,
    slow: 60,
  },
} satisfies {
  spring: Record<string, Partial<SpringConfig>>;
  duration: Record<string, number>;
}