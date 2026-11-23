# 音画同步方案：画面/字幕先行 + Edge-TTS 生成旁白

## 1. 目标

- 先制作视频画面与字幕文本，配音后生成，二者自动对齐
- 采用**逐段生成**策略：每段字幕文本独立生成一段音频，同步问题简化为"段对齐"
- 全流程免费（Edge-TTS，无额度限制，无需 API key）

## 2. 总体流程

```
script/script.txt（一行一段旁白）
   │  node scripts/gen-audio.mjs（child_process 调 edge-tts CLI）
   ▼
public/audio/seg-01.mp3 / seg-01.srt / seg-02.mp3 / seg-02.srt ...
   │  实测每段音频时长（ffprobe）
   ▼
public/audio/timings.json（每段的文本、音频路径、时长、间隙、起点）
   ▼
Remotion：读 timings.json → timing props 直接排布（Interactive 场景 + @remotion/media <Audio>）+ 字幕组件（parseSrt）
   ▼
npx remotion render Narration out/narration.mp4
```

关键思路：**段间停顿不在音频里做，交给 Remotion 摆放**——停顿节奏是剪辑层面的事，随时可调，不用重新生成音频。

## 3. 目录约定

```
script/script.txt        # 脚本源文件，一行一段
scripts/gen-audio.mjs    # 批量生成脚本（Node 调 edge-tts CLI + ffprobe）
public/audio/            # 产物：seg-XX.mp3 / seg-XX.srt / timings.json
src/MyNarration.tsx      # 按 timings.json 渲染画面 + 音频 + 字幕
src/Root.tsx             # 注册新 Composition id="Narration"
```

## 4. Edge-TTS 用法

### 安装（WSL）

```bash
pip install edge-tts
```

### 单段生成（音频 + SRT 字幕一次拿到）

```bash
edge-tts --voice en-US-AndrewNeural \
  --text "Hello, world!" \
  --write-media seg-01.mp3 \
  --write-subtitles seg-01.srt
```

SRT 的时间戳来自微软服务的词边界元数据，可用于字幕渲染。

### 挑选声音

```bash
edge-tts --list-voices
```

| 语言 | 声音 ID | 特点 |
|---|---|---|
| 英语（男） | `en-US-AndrewNeural` | 接近真人纪录片旁白，默认首选 |
| 英语（女） | `en-US-AriaNeural` / `en-US-EmmaNeural` | 自然、播报感 |
| 中文（女） | `zh-CN-XiaoxiaoNeural` | 最常用中文女声 |
| 中文（男） | `zh-CN-YunxiNeural` | 自然口语感 |

### 语速 / 音调（适配画面时长的手段）

```bash
edge-tts --rate=+10%  --text "..." --write-media out.mp3   # 加快 10%
edge-tts --rate=-20%  --text "..." --write-media out.mp3   # 负值必须用 = 连接
edge-tts --pitch=-50Hz --text "..." --write-media out.mp3
```

### 停顿限制（重要）

- edge-tts **不支持自定义 SSML**（微软封锁了 `<break>` 等标签），只暴露 rate/volume/pitch
- **段内停顿**：靠标点自然停顿（句号/逗号/省略号）；需要明显停顿就再拆段
- **段间停顿**：由 timings.json 的 `gapAfterSec` 字段控制，在 Remotion 中体现为各段组件 `from` 的偏移

## 5. timings.json 格式

```json
[
  {
    "id": "seg-01",
    "text": "In a world of endless data ...",
    "audio": "audio/seg-01.mp3",
    "srt": "audio/seg-01.srt",
    "durationSec": 4.2,
    "gapAfterSec": 0.6,
    "startSec": 0.0
  }
]
```

- `durationSec`：ffprobe 实测的音频时长
- `gapAfterSec`：该段结束后到下一段开始的间隙（脚本里可给全局默认值 + 允许逐段覆盖）
- `startSec`：由脚本累加计算：`startSec(n) = startSec(n-1) + durationSec(n-1) + gapAfterSec(n-1)`
- Remotion 中换算帧：`startFrame = Math.round(startSec * fps)`（本项目 fps = 30）

## 6. Remotion 侧实现要点

> 官方文档已明确：**不再建议直接使用 `<Sequence>`**（"It is not recommended anymore to use `<Sequence>` directly"，归为 legacy 写法）。本项目 Remotion 版本为 4.0.545，采用新的 timing props 写法。

- timing props（`from` / `durationInFrames` / `trimBefore` / `playbackRate` / `loop`）直接放在组件上，无需 `<Sequence>` 包裹。支持的组件：`<Track>`、Interactive 元素（`<Interactive.Div>` 等）、`<Img>`/`<Solid>`、`@remotion/media` 的 `<Audio>`/`<Video>`
- 每段场景：`<Interactive.Div from={startFrame} durationInFrames={durFrames}>` 内渲染该段画面 + 字幕；帧换算 `Math.round(startSec * fps)`
- 音频：`<Audio src={staticFile("audio/seg-01.mp3")} from={startFrame} durationInFrames={durFrames} />`（来自 `@remotion/media`，需安装同版本：`npm i @remotion/media@4.0.545`；从 `remotion` 包导入的旧 `<Audio>` 是 legacy 写法）
- 字幕：`parseSrt()`（`@remotion/captions`）解析每段 SRT。**注意 SRT 时间是相对该段音频起点的（0 基）**；段场景内的 `useCurrentFrame()` 已按 `from` 偏移，直接用段内相对帧即可
- 可选：用 `Interactive.create()` 包装自定义场景组件，Studio 时间线显示为单层，便于选中调试
- 顺序衔接的纯视觉场景也可用 `<Series>`（`offset` 正数制造间隙），但逐段独立 `from` 更贴合 timings.json 驱动的方式
- Composition 总时长用 `calculateMetadata` 从 timings.json 动态计算，避免手写 `durationInFrames`
- 预览校对：`npx remotion studio`，音画不齐时优先调 `gapAfterSec` 或重跑 `--rate` 生成

## 7. 实施步骤

1. 编写 `script/script.txt`（一行一段，段内短句化，停顿需求靠拆段表达）
2. 编写 `scripts/gen-audio.mjs`：读 script.txt → 逐段调 edge-tts → ffprobe 测时长 → 生成 timings.json
3. 新建 `src/MyNarration.tsx`：每段场景组件 + Audio + 字幕渲染
4. `src/Root.tsx` 注册 `id="Narration"`（calculateMetadata 动态时长）
5. Studio 预览校对 → 调间隙/语速 → 定稿渲染

## 8. 升级路径（未来不满意时的备选）

| 需求 | 方案 |
|---|---|
| 更精细的字级卡拉OK字幕 | SRT 已含词级时间可用；或换 ElevenLabs（with-timestamps API）|
| 更高品质语音 | Azure TTS 免费层 50 万字符/月，声音与 Edge 同源，迁移几乎无痛 |
| 付费精品 | ElevenLabs 免费层约 1 万字符/月，支持 break 标签与词级时间戳 |

> 注：Azure 支持 SSML `<break>`，迁移后可获得段内精确停顿能力；Edge-TTS 阶段用"拆段"策略替代。
