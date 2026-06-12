# AI 视觉对话助手（模拟面试应用）

基于浏览器的 AI 驱动模拟面试应用，通过摄像头和麦克风实时感知用户状态，由 AI 面试官给予反馈与追问。

## 技术栈

| 层面 | 技术 |
|------|------|
| 框架 | React 19 + TypeScript 6 |
| 构建 | Vite 8 |
| 样式 | Tailwind CSS 4 |
| 路由 | react-router-dom 7 |
| 语音识别 | Web Speech API（本地）+ Whisper API（云端兜底） |
| 语音合成 | SpeechSynthesis API |
| AI 对话 | OpenAI GPT-4o / Claude API（多模态） |
| 视频处理 | Canvas API + requestVideoFrameCallback |

## 快速开始

```bash
git clone https://github.com/x123-cc/ai-interview-app.git
cd ai-interview-app
npm install
```

### 配置 API Key

1. 启动开发服务器：`npm run dev`
2. 浏览器访问 http://localhost:5173/settings
3. 选择 LLM 服务商并填入 API Key
4. Key 存储在浏览器 localStorage 中

### 启动

```bash
npm run dev        # 开发模式（http://localhost:5173）
npm run build      # 生产构建
npm run preview    # 预览生产构建
```

## 功能特性

- **视频采集**：摄像头实时画面 + 帧提取 + 变化检测
- **语音识别**：浏览器端优先，云端 Whisper 兜底
- **语音合成**：FIFO 队列顺序播报 + 语速/音调调节
- **多模态对话**：文本 + 图片发送给 LLM，AI 理解视觉内容
- **端云协同**：智能调度本地/云端资源，控制 API 成本
- **面试引擎**：7 阶段状态机 + 追问机制 + 多维度评分
- **题库系统**：30 道种子题目，技术/行为/案例三类

## 原创功能声明

1. **端云协同调度器**（`src/hooks/useSyncScheduler.ts`）— 帧采样 + 上传决策 + 成本控制
2. **面试状态机**（`src/services/interview-engine.ts`）— 7 阶段流程 + 生命周期钩子
3. **题库与追问策略**（`src/config/questions.ts` + `src/utils/scoring.ts`）— 30 题 + 规则引擎
4. **评分体系**（`src/utils/scoring.ts`）— 4 维度加权 + LLM/降级双模式

## 依赖列表

| 依赖 | 版本 | 用途 |
|------|------|------|
| react | ^19 | UI 框架 |
| react-dom | ^19 | DOM 渲染 |
| react-router-dom | ^7 | 客户端路由 |
| tailwindcss | ^4 | CSS 框架 |
| @tailwindcss/vite | ^4 | Tailwind Vite 集成 |
| typescript | ~6.0 | 类型检查 |
| vite | ^8 | 构建工具 |
| @vitejs/plugin-react | ^6 | React 编译 |
| prettier | ^3 | 代码格式化 |
| eslint | ^10 | 代码检查 |

## 浏览器兼容性

| 功能 | Chrome | Edge | Safari | Firefox |
|------|:--:|:--:|:--:|:--:|
| 摄像头/麦克风 | ✅ | ✅ | ✅ | ✅ |
| 语音识别 | ✅ | ✅ | ✅ | ❌（需云端兜底） |
| 语音合成 | ✅ | ✅ | ✅ | ✅ |

## 项目结构

```
src/
├── components/     # UI 组件
│   ├── camera/     # CameraView / CameraStatus
│   ├── interview/  # InterviewPanel / TimerBar
│   ├── layout/     # AppShell / NavBar
│   └── shared/     # VolumeMeter
├── hooks/          # React Hooks（useCamera / useSTT / useTTS 等）
├── services/       # API 服务（LLM / STT / 对话管理 / 面试引擎）
├── utils/          # 工具函数（视频帧 / 成本 / 题库 / 评分）
├── config/         # 配置（Prompt 模板 / 题库种子）
├── types/          # TypeScript 类型定义
└── pages/          # 页面组件
```

## 许可证

MIT
