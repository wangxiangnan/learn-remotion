import {
  useCurrentFrame,
  useVideoConfig,
  AbsoluteFill,
  Interactive,
  interpolate,
  spring,
  Easing,
  Solid,
} from 'remotion'

export const MyComposition = () => {
  const frame = useCurrentFrame()
  const { durationInFrames, fps } = useVideoConfig()
  const springProgress = spring({
    frame,
    fps,
    durationInFrames: 100,
    config: {
      damping: 20, stiffness: 200
    }
  })
  // 将 0→1 的进度，映射为 0→360 度的旋转
  const rotation = interpolate(springProgress, [0, 1], [0, 360]);

  // 将 0→1 的进度，映射为 0→100 像素的垂直位移
  const translateY = interpolate(springProgress, [0, 1], [0, 100]);

  return <>
    <AbsoluteFill className='bg-white flex justify-center items-center'>
      <Interactive.H1
        className='text-center text-green-500'
        style={{
          fontSize: '80px',
          opacity: springProgress,
          transform: `translateY(${translateY}px)`
        }}
      >
        Hello world!
      </Interactive.H1>
    </AbsoluteFill>
  </>
}