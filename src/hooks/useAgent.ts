/**
 * useAgent Hook
 *
 * 将 Agent 循环桥接到 React 组件，提供面试流程的声明式控制。
 *
 * 接口与 useInterview 保持兼容，使得 InterviewPage 可以
 * 通过一个开关在经典模式和 Agent 模式之间切换。
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { AgentLoop } from '@/agent/agent-loop';
import { createAgentLLMClient } from '@/services/llm';
import type {
  AgentConfig,
  AgentResponse,
  AgentState,
  AgentLLMClient,
  CandidateProfile,
  InterviewReport,
} from '@/types/agent';
import type { ChatMessage } from '@/types';

export interface UseAgentOptions {
  /** API Key */
  apiKey: string;
  /** API 端点 */
  baseUrl: string;
  /** 模型名称（可选） */
  model?: string;
  /** Agent 配置 */
  agentConfig: AgentConfig;
  /** TTS 播报回调 */
  onSpeak?: (text: string) => void;
  /** 视觉帧捕获（返回 base64 或 null） */
  captureFrame?: () => string | null;
  /** 视觉监控是否启用（需摄像头 active） */
  visionEnabled?: boolean;
}

export interface UseAgentReturn {
  /** Agent 当前状态 */
  agentState: AgentState;
  /** 面试是否已开始 */
  hasStarted: boolean;
  /** 面试是否已结束 */
  isComplete: boolean;
  /** 对话消息（含系统消息） */
  messages: ChatMessage[];
  /** 候选人画像（调试用） */
  candidateProfile: CandidateProfile | null;
  /** 最终报告 */
  finalReport: InterviewReport | null;
  /** Agent 最近一步的详细信息（调试用） */
  lastSteps: AgentResponse['steps'];
  /** 是否正在处理（Agent 循环运行中） */
  isProcessing: boolean;
  /** 开始面试 */
  start: () => Promise<string>;
  /** 用户提交回答 */
  submitAnswer: (answer: string, imageBase64?: string) => Promise<void>;
  /** 结束面试 */
  endInterview: () => Promise<void>;
  /** 保存到历史记录 */
  saveToHistory: () => ChatMessage[];
  /** 重置 */
  reset: () => void;
}

export default function useAgent(options: UseAgentOptions): UseAgentReturn {
  const {
    apiKey,
    baseUrl,
    model = 'gpt-4o',
    agentConfig,
    onSpeak,
    captureFrame,
    visionEnabled = false,
  } = options;

  const [agentState, setAgentState] = useState<AgentState>('idle');
  const [hasStarted, setHasStarted] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [candidateProfile, setCandidateProfile] = useState<CandidateProfile | null>(null);
  const [finalReport, setFinalReport] = useState<InterviewReport | null>(null);
  const [lastSteps, setLastSteps] = useState<AgentResponse['steps']>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const agentRef = useRef<AgentLoop | null>(null);
  const llmClientRef = useRef<AgentLLMClient | null>(null);

  // 初始化 Agent
  useEffect(() => {
    if (!apiKey) return;

    const client = createAgentLLMClient({ apiKey, baseUrl, model });
    llmClientRef.current = client;

    const agent = new AgentLoop(client, {
      ...agentConfig,
      visionEnabled,
    });

    // 注入回调
    if (onSpeak) {
      agent['context'].onSpeak = onSpeak;
    }
    if (captureFrame) {
      agent['context'].captureFrame = captureFrame;
    }

    agentRef.current = agent;

    return () => {
      agentRef.current?.reset();
      agentRef.current = null;
      llmClientRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * 开始面试
   */
  const start = useCallback(async (): Promise<string> => {
    const agent = agentRef.current;
    if (!agent) throw new Error('Agent 未初始化');

    setAgentState('planning');
    setIsProcessing(true);

    try {
      const welcome = await agent.startInterview();
      setMessages(agent.getTranscript());
      setHasStarted(true);
      setAgentState('waiting_for_user');
      return welcome;
    } catch (err) {
      setAgentState('idle');
      throw err;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  /**
   * 用户提交回答
   */
  const submitAnswer = useCallback(async (answer: string, imageBase64?: string) => {
    const agent = agentRef.current;
    if (!agent || !hasStarted || isComplete) return;

    setAgentState('planning');
    setIsProcessing(true);
    setLastSteps([]);

    try {
      // 自动采集摄像头帧
      let frame = imageBase64;
      if (!frame && visionEnabled && captureFrame) {
        frame = captureFrame() ?? undefined;
      }

      const response: AgentResponse = await agent.processUserInput(answer, frame);

      // 同步状态到 React
      setMessages(agent.getTranscript());
      setCandidateProfile(agent.getCandidateProfile().toJSON());
      setLastSteps(response.steps);

      if (response.isComplete) {
        setIsComplete(true);
        setFinalReport(response.finalReport ?? null);
        setAgentState('done');
      } else {
        setAgentState('waiting_for_user');
      }

      // TTS 播报（由 Agent 工具内的 onSpeak 处理，这里做 fallback）
      if (response.text && onSpeak && response.steps.length === 0) {
        onSpeak(response.text);
      }
    } catch (err) {
      console.error('Agent processUserInput error:', err);
      setAgentState('waiting_for_user');
    } finally {
      setIsProcessing(false);
    }
  }, [hasStarted, isComplete, visionEnabled, captureFrame, onSpeak]);

  /**
   * 主动结束面试
   */
  const endInterview = useCallback(async () => {
    const agent = agentRef.current;
    if (!agent) return;

    setAgentState('planning');
    setIsProcessing(true);

    try {
      const response = await agent.processUserInput('我想结束面试，谢谢。');
      setMessages(agent.getTranscript());
      setCandidateProfile(agent.getCandidateProfile().toJSON());
      setLastSteps(response.steps);

      if (response.isComplete || response.finalReport) {
        setIsComplete(true);
        setFinalReport(response.finalReport ?? null);
        setAgentState('done');
      }
    } catch (err) {
      console.error('endInterview error:', err);
    } finally {
      setIsProcessing(false);
    }
  }, []);

  /**
   * 导出对话记录（用于保存）
   */
  const saveToHistory = useCallback((): ChatMessage[] => {
    return messages.filter((m) => m.role !== 'system');
  }, [messages]);

  /**
   * 重置
   */
  const reset = useCallback(() => {
    agentRef.current?.reset();
    setAgentState('idle');
    setHasStarted(false);
    setIsComplete(false);
    setMessages([]);
    setCandidateProfile(null);
    setFinalReport(null);
    setLastSteps([]);
    setIsProcessing(false);
  }, []);

  return {
    agentState,
    hasStarted,
    isComplete,
    messages,
    candidateProfile,
    finalReport,
    lastSteps,
    isProcessing,
    start,
    submitAnswer,
    endInterview,
    saveToHistory,
    reset,
  };
}
