/**
 * Agent 相关类型定义
 *
 * 定义 Agent 循环、工具调用、记忆系统所需的所有类型。
 */

import type { LLMClient, ChatMessage, HistoryRecord } from './index';

// ── Agent 状态 ──

/** Agent 自身状态 */
export type AgentState =
  | 'idle'              // 未启动
  | 'planning'          // 正在规划下一步
  | 'acting'            // 正在执行工具
  | 'observing'         // 正在处理观察结果
  | 'reflecting'        // 正在反思并决策
  | 'waiting_for_user'  // 等待用户输入
  | 'done';             // 面试结束

// ── 工具定义 ──

/** 工具参数定义 */
export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required: boolean;
  enum?: string[];
  items?: { type: string };
}

/** 工具执行结果 */
export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  /** 本次工具调用的 token 消耗 */
  tokens?: { input: number; output: number };
}

/** Agent 工具接口 */
export interface AgentTool {
  /** 工具名称（LLM function calling 使用） */
  name: string;
  /** 工具描述（LLM 用于判断何时调用） */
  description: string;
  /** 参数定义 */
  parameters: ToolParameter[];
  /** 执行工具 */
  execute(params: Record<string, unknown>, context: AgentContext): Promise<ToolResult>;
  /** 是否为纯本地工具（不调用 LLM，无延迟） */
  localOnly?: boolean;
}

/** OpenAI 兼容的 function calling 工具定义 */
export interface FunctionToolDef {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, {
        type: string;
        description: string;
        enum?: string[];
      }>;
      required: string[];
    };
  };
}

// ── LLM 扩展类型 ──

/** LLM 工具调用 */
export interface LLMToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

/** 扩展 LLMResult 支持工具调用 */
export interface LLMResultWithTools {
  content: string;
  toolCalls?: LLMToolCall[];
  inputTokens: number;
  outputTokens: number;
  model: string;
}

/** 工具角色消息 */
export interface ToolMessage {
  role: 'tool';
  tool_call_id: string;
  content: string;
}

/** 通用 LLM 消息（支持 tool_calls 扩展字段） */
export interface LLMMessageWithTools {
  role: string;
  content?: string | null;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
}

/** 扩展 LLM 客户端接口 */
export interface AgentLLMClient extends LLMClient {
  /** 带工具调用的对话 */
  chatWithTools(
    messages: LLMMessageWithTools[],
    tools: FunctionToolDef[],
    options?: import('@/types').LLMCallOptions,
  ): Promise<LLMResultWithTools>;
}

// ── Agent 决策 ──

/** Agent 单步决策 */
export interface AgentDecision {
  /** 调用的工具名（或 'respond_to_user'） */
  toolName: string;
  /** 工具参数 */
  params: Record<string, unknown>;
  /** LLM 推理过程 */
  reasoning: string;
}

/** Agent 观察记录 */
export interface AgentObservation {
  stepIndex: number;
  toolName: string;
  result: ToolResult;
  timestamp: number;
}

// ── 记忆系统 ──

/** 候选人画像 */
export interface CandidateProfile {
  /** 强项标签 */
  strengths: string[];
  /** 弱项标签 */
  weaknesses: string[];
  /** 各维度当前评分 (1-10) */
  dimensionScores: Record<string, number>;
  /** 情绪变化历史 */
  emotionTrend: Array<{
    emotion: string;
    timestamp: number;
  }>;
  /** 作弊标记次数 */
  cheatingFlags: number;
  /** 已回答问题的评分历史 */
  answerHistory: Array<{
    question: string;
    answer: string;
    coverageRate: number;
    score: number;
    timestamp: number;
  }>;
}

/** 工作记忆条目 */
export interface WorkingMemoryEntry {
  role: 'user' | 'agent' | 'tool' | 'system';
  content: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

/** 情景记忆快照 */
export interface EpisodicSnapshot {
  type: 'significant_answer' | 'cheating_alert' | 'emotional_shift' | 'interview_milestone';
  description: string;
  data: Record<string, unknown>;
  timestamp: number;
}

// ── Agent 上下文 ──

/** Agent 全局上下文（注入到每个工具） */
export interface AgentContext {
  /** LLM 客户端 */
  llmClient: AgentLLMClient;
  /** 工作记忆 */
  workingMemory: {
    entries: WorkingMemoryEntry[];
    add(role: WorkingMemoryEntry['role'], content: string, metadata?: Record<string, unknown>): void;
    getRecent(n: number): WorkingMemoryEntry[];
    buildMessages(): import('@/types').LLMTextMessage[];
  };
  /** 候选人画像 */
  candidateProfile: CandidateProfile & {
    addStrength(s: string): void;
    addWeakness(w: string): void;
    updateScore(dimension: string, score: number): void;
    recordEmotion(emotion: string): void;
    recordAnswer(q: string, a: string, coverage: number, score: number): void;
    flagCheating(): void;
  };
  /** 情景记忆 */
  episodicMemory: {
    snapshots: EpisodicSnapshot[];
    record(
      type: EpisodicSnapshot['type'],
      description: string,
      data: Record<string, unknown>,
    ): void;
    getByType(type: string): EpisodicSnapshot[];
  };
  /** Agent 配置 */
  config: AgentConfig;
  /** TTS 播报回调 */
  onSpeak?: (text: string) => void;
  /** 视觉分析请求回调（返回 base64 或 null） */
  captureFrame?: () => string | null;
}

/** Agent 配置 */
export interface AgentConfig {
  /** 单次用户输入的最大 Agent 内部迭代次数 */
  maxIterations: number;
  /** 是否启用视觉监控 */
  visionEnabled: boolean;
  /** 追问深度：0=不追问 1=浅层追问 2=深层追问 */
  followUpDepth: 0 | 1 | 2;
  /** 面试总时长（秒，0=不限） */
  maxDuration: number;
  /** 面试模式 */
  mode: 'interview' | 'review';
  /** 简历文本 */
  resume: string;
  /** 岗位 JD */
  jd?: string;
  /** 预解析问题列表（review 模式） */
  questions?: string[];
  /** 复盘上下文 */
  context?: string;
}

/** Agent 响应（返回给 UI 层） */
export interface AgentResponse {
  /** 展示给用户的文本 */
  text: string;
  /** Agent 内部执行的步骤（调试用） */
  steps: Array<{
    toolName: string;
    reasoning: string;
    result: ToolResult;
  }>;
  /** 面试是否结束 */
  isComplete: boolean;
  /** 如果结束，附带报告 */
  finalReport?: InterviewReport;
}

/** 面试报告 */
export interface InterviewReport {
  totalScore: number;
  dimensions: Array<{
    name: string;
    score: number;
    comment: string;
  }>;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  transcript: ChatMessage[];
}
