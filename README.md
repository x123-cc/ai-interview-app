通过网盘分享的文件：七牛云参赛项目介绍
链接: https://pan.baidu.com/s/1YmecBxkrsEPmukmqnBVnIg?pwd=ig7r 提取码: ig7r

# AI 视觉对话助手 — 模拟面试应用

一款基于浏览器的 AI 驱动模拟面试应用。打开摄像头与麦克风，AI 面试官能够**看到**你的表情和姿态、**听到**你的回答，并给予自然流畅的语音反馈与追问。

## 目录

- [核心能力](#核心能力)
- [技术架构](#技术架构)
- [快速开始](#快速开始)
- [功能详情](#功能详情)
- [端云协同策略](#端云协同策略)
- [项目结构](#项目结构)
- [原创功能声明](#原创功能声明)
- [依赖列表](#依赖列表)
- [浏览器兼容性](#浏览器兼容性)
- [开发规范](#开发规范)

## 核心能力

| 能力           | 说明                                                                           |
| -------------- | ------------------------------------------------------------------------------ |
| **视觉理解**   | 实时采集摄像头画面，提取关键帧发送给多模态 AI 分析面部表情、姿态和着装         |
| **语音对话**   | 浏览器端语音识别（Web Speech API）+ 云端 Whisper 兜底，AI 回复通过语音合成播报 |
| **面试引擎**   | 7 阶段状态机驱动面试流程：欢迎 → 问答循环 → 评估 → 总结 → 评分                 |
| **端云协同**   | 智能调度本地与云端资源，在保证体验的同时控制 API 调用成本                      |
| **多维度评分** | 沟通表达、专业知识、逻辑思维、应变能力 4 维度加权评分 + 改进建议               |

## 技术架构

```
┌──────────────────────────────────────────────────────┐
│                    前端 SPA（React 19）                 │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │ 摄像头采集 │  │ 麦克风采集 │  │ 语音识别  │           │
│  │useCamera │  │useAudio  │  │ useSTT   │           │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘           │
│       │             │             │                  │
│  ┌────┴─────────────┴─────────────┴──────────────┐  │
│  │              端云协同调度器                      │  │
│  │  useSyncScheduler + CostTracker + NetworkStatus│  │
│  └────────────────────┬──────────────────────────┘  │
│                       │                             │
│  ┌────────────────────┴──────────────────────────┐  │
│  │              LLM 多模态 API 调用                │  │
│  │  文本 + 图片 → GPT-4o / Claude → 面试官回复     │  │
│  └────────────────────┬──────────────────────────┘  │
│                       │                             │
│  ┌────────────────────┴──────────────────────────┐  │
│  │              语音合成播报（TTS）                 │  │
│  │  useTTS → SpeechSynthesis → 用户听到回复       │  │
│  └───────────────────────────────────────────────┘  │
│                                                      │
│  ┌──────────────────────────────────────────────────┐ │
│  │           面试引擎（状态机 + 题库 + 评分）         │ │
│  │  InterviewEngine → QuestionBank → Scoring       │ │
│  └──────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

## 快速开始

### 环境要求

- Node.js 18+
- 现代浏览器（Chrome / Edge 推荐）

### 安装与启动

```bash
# 克隆仓库
git clone https://github.com/x123-cc/ai-interview-app.git
cd ai-interview-app

# 安装依赖
npm install

# 启动开发服务器
npm run dev
# 浏览器访问 http://localhost:5173
```

### 配置 API Key

1. 访问 http://localhost:5173/settings
2. 选择 LLM 服务商（OpenAI / Anthropic / 自定义端点）
3. 填入你的 API Key 并保存

> **注意**：API Key 仅存储在浏览器 localStorage 中，不会上传至任何服务器。

### 可用命令

| 命令                   | 说明                       |
| ---------------------- | -------------------------- |
| `npm run dev`          | 启动开发服务器（含热更新） |
| `npm run build`        | 生产构建                   |
| `npm run preview`      | 预览生产构建               |
| `npm run lint`         | ESLint 代码检查            |
| `npm run format`       | Prettier 代码格式化        |
| `npm run format:check` | 检查代码格式（CI 用）      |

## 功能详情

### 摄像头采集

- **useCamera Hook**：五态状态机（idle → requesting → active | denied | error）
- **CameraView 组件**：将 MediaStream 渲染为 `<video>` 实时画面，支持镜像翻转
- **CameraStatus 组件**：半透明状态栏叠加，展示状态圆点 + 错误提示 + 重试按钮
- 组件卸载时自动释放摄像头资源

### 麦克风采集

- **useAudioCapture Hook**：AudioContext + AnalyserNode 实现实时音量监测
- **VolumeMeter 组件**：绿 / 黄 / 红分档柱状条，支持无障碍属性
- **useMediaDevices Hook**：设备枚举 + 热插拔检测，支持多麦克风切换

### 语音识别（STT）

- **useSTT Hook**：封装 Web Speech API，支持中英文
- 中间结果实时展示（边说边显示），最终结果自动累积
- 静默 1.5 秒自动截止，AI 知道"用户说完了"
- 置信度评估 + 低置信度自动标记需要云端兜底

### 云端语音降级

- **Whisper API 服务**：OpenAI Whisper 云端高精度识别
- **SpeechService**：本地优先 → 置信度不足 → 云端兜底 → 失败降级回本地
- 每次降级记录延迟和费用，成本透明

### 语音合成（TTS）

- **useTTS Hook**：封装 SpeechSynthesis API
- FIFO 队列顺序播报，不重叠不丢失
- 语音选择（系统可用语音列表）+ 语速 / 音调调节

### LLM 对话

- **createLLMClient**：OpenAI 兼容的 Chat Completions API 封装
- 支持纯文本和多模态（文本 + 图片）两种调用方式
- 指数退避重试（429 / 5xx）+ AbortController 中断
- Token 消耗统计

### 面试引擎

- **InterviewEngine 状态机**：idle → welcome → asking ⇄ answering → evaluating → summary → score
- **onEnter / onLeave 生命周期钩子**：支持异步回调
- **useInterview Hook**：将状态机桥接到 React 组件

### 题库系统

- 30 道种子题目，覆盖技术面试 / 行为面试 / 案例面试三类
- 每类 10 题，三级难度（初级 / 中级 / 高级）
- 每题包含期望回答要点和追问方向提示
- 支持按类型 / 难度 / 标签组合筛选
- Fisher-Yates 洗牌 + 分类轮询公平选题

### 追问与计时

- **evaluateAnswerQuality**：关键词匹配计算覆盖率，< 0.5 或 < 20 字触发追问
- **useTimer Hook**：通用倒计时，支持不限时模式
- **TimerBar 组件**：颜色分档进度条（蓝 → 橙 → 红 + 脉冲）

### 评分系统

- 4 维度加权评分：沟通表达（25%）+ 专业知识（30%）+ 逻辑思维（25%）+ 应变能力（20%）
- LLM 评分模式：构建结构化 Prompt，解析 JSON 响应
- 规则降级模式：LLM 不可用时基于回答长度和覆盖率估算
- **buildInterviewReport**：聚合维度 / 逐题回顾 / 费用 / 强弱维度 / 改进建议

### 页面功能

| 页面         | 功能                                                    |
| ------------ | ------------------------------------------------------- |
| **首页**     | 面试类型选择（技术 / 行为 / 案例）+ 难度 + 题数配置     |
| **面试页**   | 对话面板 + 摄像头侧栏 + 语音 / 文本双输入 + 音量 + 计时 |
| **设置页**   | API Key 管理 + 浏览器兼容性检测                         |
| **历史记录** | localStorage 存储 + 卡片列表 + 分数颜色编码             |

## 端云协同策略

本项目采用"本地优先、云端兜底"的端云协同架构，在保证交互质量的同时控制 API 调用成本。

### 调度决策

| 条件                         | 策略                           |
| ---------------------------- | ------------------------------ |
| 用户静默                     | 暂停云端上传，仅保留本地分析   |
| 画面静止（差异 < 0.1）       | 跳过本次上传                   |
| 上传间隔 < 5s                | 跳过本次上传                   |
| 用户说话中 + 画面变化 > 阈值 | 上传关键帧至云端               |
| 网络离线                     | 暂停所有云端调用，缓存待上传帧 |
| 慢速网络（2G/3G）            | 降低上传频率，优先本地处理     |

### 成本控制

| 措施          | 说明                                |
| ------------- | ----------------------------------- |
| 本地 STT 优先 | Web Speech API 免费，Whisper 仅兜底 |
| 本地 TTS      | SpeechSynthesis 免费                |
| 帧率节流      | 云端上传间隔 ≥ 5s，本地分析 500ms   |
| 画面变化检测  | 静止画面跳过上传，节省图片 token    |
| 费用追踪      | CostTracker 实时统计每次调用费用    |

## 项目结构

```
ai-interview-app/
├── public/                          # 静态资源
├── src/
│   ├── main.tsx                     # 应用入口
│   ├── App.tsx                      # 根组件（BrowserRouter）
│   ├── index.css                    # Tailwind CSS 入口
│   │
│   ├── components/                  # UI 组件
│   │   ├── camera/                  # 摄像头相关
│   │   │   ├── CameraView.tsx       # 画面渲染（MediaStream → video）
│   │   │   └── CameraStatus.tsx     # 状态指示器
│   │   ├── interview/               # 面试相关
│   │   │   └── TimerBar.tsx         # 倒计时进度条
│   │   ├── layout/                  # 布局组件
│   │   │   ├── AppShell.tsx         # 主布局（Header + Main + Footer）
│   │   │   └── NavBar.tsx           # 导航栏
│   │   └── shared/                  # 通用组件
│   │       └── VolumeMeter.tsx      # 音量指示器
│   │
│   ├── hooks/                       # React Hooks（数据层）
│   │   ├── useCamera.ts             # 摄像头采集
│   │   ├── useAudioCapture.ts       # 麦克风采集 + 音量监测
│   │   ├── useMediaDevices.ts       # 设备枚举 + 热插拔
│   │   ├── useSTT.ts                # 浏览器语音识别
│   │   ├── useTTS.ts                # 语音合成播报
│   │   ├── useTimer.ts              # 通用倒计时
│   │   ├── useInterview.ts          # 面试流程控制
│   │   ├── useSyncScheduler.ts      # 端云协同调度
│   │   └── useNetworkStatus.ts      # 网络状态感知
│   │
│   ├── services/                    # 服务层
│   │   ├── llm.ts                   # LLM API 客户端
│   │   ├── stt.ts                   # Whisper API 云端识别
│   │   ├── speech.ts                # 语音识别服务（本地 + 云端）
│   │   ├── conversation.ts          # 对话管理器
│   │   └── interview-engine.ts      # 面试状态机
│   │
│   ├── utils/                       # 工具函数
│   │   ├── video.ts                 # 视频帧提取 / 采样 / 差异计算
│   │   ├── audio.ts                 # （预留）音频处理
│   │   ├── browser.ts              # 浏览器兼容性检测
│   │   ├── questions.ts            # 题库筛选与选题
│   │   ├── scoring.ts              # 评分算法（LLM + 降级）
│   │   ├── report.ts               # 面试报告聚合
│   │   └── cost.ts                 # API 调用成本追踪
│   │
│   ├── config/                      # 配置文件
│   │   ├── prompts.ts              # System Prompt 模板
│   │   └── questions.ts            # 题库种子数据
│   │
│   ├── types/                       # TypeScript 类型定义
│   │   ├── index.ts                 # 主要类型导出
│   │   └── speech.d.ts             # Web Speech API 全局类型
│   │
│   ├── pages/                       # 页面组件
│   │   ├── HomePage.tsx             # 首页（面试类型选择）
│   │   ├── InterviewPage.tsx        # 面试主界面
│   │   ├── SettingsPage.tsx         # 设置页面
│   │   └── HistoryPage.tsx          # 历史记录
│   │
│   └── routes/
│       └── index.tsx                # 路由配置
│
├── index.html                       # HTML 入口
├── package.json
├── vite.config.ts                   # Vite 配置（Tailwind + 路径别名）
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
├── eslint.config.js                 # ESLint Flat Config
├── .prettierrc                      # Prettier 配置
├── .prettierignore
├── .gitignore
└── README.md
```

## 原创功能声明

本项目以下模块为原创实现：

| 模块               | 文件                                               | 说明                                             |
| ------------------ | -------------------------------------------------- | ------------------------------------------------ |
| **端云协同调度器** | `src/hooks/useSyncScheduler.ts`                    | 综合语音状态 + 画面变化 + 时间间隔的三维决策算法 |
| **面试状态机**     | `src/services/interview-engine.ts`                 | 7 阶段状态机 + 生命周期钩子 + 事件驱动转换       |
| **题库与追问策略** | `src/config/questions.ts` + `src/utils/scoring.ts` | 30 道自编题目 + 关键词匹配规则引擎               |
| **评分体系**       | `src/utils/scoring.ts`                             | 4 维度加权 + LLM/降级双模式 + 结构化反馈生成     |

## 依赖列表

| 依赖                        | 版本   | 用途               |
| --------------------------- | ------ | ------------------ |
| react                       | ^19.2  | UI 框架            |
| react-dom                   | ^19.2  | DOM 渲染           |
| react-router-dom            | ^7.17  | 客户端路由         |
| tailwindcss                 | ^4.3   | CSS 工具框架       |
| @tailwindcss/vite           | ^4.3   | Tailwind Vite 集成 |
| typescript                  | ~6.0   | 类型系统           |
| vite                        | ^8.0   | 构建工具           |
| @vitejs/plugin-react        | ^6.0   | React 编译（Oxc）  |
| prettier                    | ^3.8   | 代码格式化         |
| eslint                      | ^10.3  | 代码检查           |
| @eslint/js                  | ^10.0  | ESLint 推荐规则    |
| typescript-eslint           | ^8.59  | TypeScript ESLint  |
| eslint-plugin-react-hooks   | ^7.1   | React Hooks 规则   |
| eslint-plugin-react-refresh | ^0.5   | HMR 规则           |
| globals                     | ^17.6  | 全局变量定义       |
| @types/react                | ^19.2  | React 类型         |
| @types/react-dom            | ^19.2  | ReactDOM 类型      |
| @types/node                 | ^24.12 | Node.js 类型       |

> 所有依赖均为开发或运行时必需，无冗余引入。未使用任何 UI 组件库，所有组件均为手写实现。

## 浏览器兼容性

| 功能                       | Chrome | Edge | Safari | Firefox |
| -------------------------- | :----: | :--: | :----: | :-----: |
| 摄像头采集                 |   ✅   |  ✅  |   ✅   |   ✅    |
| 麦克风采集                 |   ✅   |  ✅  |   ✅   |   ✅    |
| 语音识别（Web Speech API） |   ✅   |  ✅  |   ✅   |   ❌    |
| 语音识别（Whisper 兜底）   |   ✅   |  ✅  |   ✅   |   ✅    |
| 语音合成                   |   ✅   |  ✅  |   ✅   |   ✅    |
| Network Information API    |   ✅   |  ✅  |   ❌   |   ✅    |

> Firefox 不支持 Web Speech API，会自动降级为云端 Whisper 识别。

## 开发规范

本项目严格遵循以下规范：

- **Commit 规范**：[Conventional Commits](https://www.conventionalcommits.org/)，前缀 `feat:` / `fix:` / `chore:` / `docs:`
- **PR 规范**：每个 PR 只做一件事，标题 + 功能描述 + 实现思路 + 测试方式四项齐全
- **代码风格**：Prettier + ESLint Flat Config 自动检查
- **语言规范**：所有 commit message、PR 描述、代码注释、文档均使用中文
- **分支策略**：每个 PR 独立 feature 分支，合并后主分支必须可运行

详见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 许可证

MIT License
