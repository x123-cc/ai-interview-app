import { useState, useRef, useCallback, useEffect } from 'react';
import { InterviewEngine, type InterviewStage, type InterviewContext, type InterviewEngineConfig } from '@/services/interview-engine';
import type { Question } from '@/types';

/** useInterview 返回值 */
export interface UseInterviewReturn {
  /** 当前面试阶段 */
  stage: InterviewStage;
  /** 面试上下文 */
  context: InterviewContext;
  /** 当前题目 */
  currentQuestion: Question | null;
  /** 当前题号（1-based） */
  currentNumber: number;
  /** 总题数 */
  totalQuestions: number;
  /** 开始面试 */
  start: () => Promise<void>;
  /** 用户提交回答 */
  submitAnswer: (answer: string) => Promise<void>;
  /** 追问完成，继续下一题 */
  continueToNext: () => Promise<void>;
  /** 结束面试 */
  endInterview: () => Promise<void>;
  /** 重置面试 */
  reset: () => void;
}

/**
 * 面试流程 Hook
 *
 * 将 InterviewEngine 状态机桥接到 React 组件中，
 * 提供面试流程的声明式控制。
 *
 * @param config - 面试配置（题目列表 + 时限）
 */
export default function useInterview(
  config: InterviewEngineConfig,
): UseInterviewReturn {
  const engineRef = useRef(new InterviewEngine(config));
  const [stage, setStage] = useState<InterviewStage>('idle');
  const [context, setContext] = useState<InterviewContext>(
    engineRef.current.getContext(),
  );

  /** 同步状态到 React */
  const syncState = useCallback(() => {
    setStage(engineRef.current.getStage());
    setContext(engineRef.current.getContext());
  }, []);

  /**
   * 开始面试
   */
  const start = useCallback(async () => {
    await engineRef.current.transition('START');
    syncState();
    await engineRef.current.transition('WELCOME_DONE');
    syncState();
  }, [syncState]);

  /**
   * 用户提交回答
   */
  const submitAnswer = useCallback(
    async (answer: string) => {
      engineRef.current.recordAnswer(answer);
      if (engineRef.current.getStage() === 'answering') {
        await engineRef.current.transition('ANSWER_RECEIVED');
      }
      syncState();
    },
    [syncState],
  );

  /**
   * 追问完成，继续下一题或进入总结
   */
  const continueToNext = useCallback(async () => {
    const ctx = engineRef.current.getContext();
    const isLast =
      ctx.currentQuestionIndex >= ctx.totalQuestions - 1;

    if (isLast) {
      await engineRef.current.transition('ALL_QUESTIONS_DONE');
    } else {
      await engineRef.current.transition('EVALUATION_DONE');
    }
    syncState();
  }, [syncState]);

  /**
   * 结束面试（进入总结和评分阶段）
   */
  const endInterview = useCallback(async () => {
    const currentStage = engineRef.current.getStage();
    if (currentStage === 'summary') {
      await engineRef.current.transition('FEEDBACK_DELIVERED');
    }
    syncState();
  }, [syncState]);

  /**
   * 重置面试
   */
  const reset = useCallback(() => {
    engineRef.current.reset();
    syncState();
  }, [syncState]);

  /**
   * 组件卸载时重置
   */
  useEffect(() => {
    return () => {
      engineRef.current.reset();
    };
  }, []);

  const ctx = context;

  return {
    stage,
    context,
    currentQuestion: ctx.currentQuestion,
    currentNumber: Math.max(1, ctx.currentQuestionIndex + 1),
    totalQuestions: ctx.totalQuestions,
    start,
    submitAnswer,
    continueToNext,
    endInterview,
    reset,
  };
}
