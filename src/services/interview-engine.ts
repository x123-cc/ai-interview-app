import type { Question } from '@/types';

/** 面试阶段 */
export type InterviewStage =
  | 'idle'
  | 'welcome'
  | 'asking'
  | 'answering'
  | 'evaluating'
  | 'summary'
  | 'score';

/** 面试事件 */
export type InterviewEvent =
  | 'START'
  | 'WELCOME_DONE'
  | 'QUESTION_DELIVERED'
  | 'ANSWER_RECEIVED'
  | 'EVALUATION_DONE'
  | 'ALL_QUESTIONS_DONE'
  | 'FEEDBACK_DELIVERED'
  | 'RESET';

/** 面试引擎配置 */
export interface InterviewEngineConfig {
  /** 面试题目列表 */
  questions: Question[];
  /** 每题回答时限（秒），0 表示不限时 */
  answerTimeLimit?: number;
}

/** 面试上下文数据 */
export interface InterviewContext {
  /** 当前题目索引 */
  currentQuestionIndex: number;
  /** 总题目数 */
  totalQuestions: number;
  /** 当前题目 */
  currentQuestion: Question | null;
  /** 用户回答记录 */
  answers: { questionId: string; answer: string }[];
  /** 面试开始时间 */
  startTime: number;
  /** 当前问题开始时间 */
  questionStartTime: number;
}

/** 阶段变更回调 */
export type StageCallback = (
  stage: InterviewStage,
  context: InterviewContext,
) => void | Promise<void>;

/**
 * 面试引擎
 *
 * 管理面试流程状态机，支持阶段切换、生命周期钩子和题目推进。
 *
 * 状态转换图：
 * idle → welcome → asking ⇄ answering → evaluating → asking（循环）
 *                                               → summary → score → idle
 */
export class InterviewEngine {
  private stage: InterviewStage = 'idle';
  private config: InterviewEngineConfig;
  private context: InterviewContext;
  private onEnterCallbacks = new Map<InterviewStage, StageCallback[]>();
  private onLeaveCallbacks = new Map<InterviewStage, StageCallback[]>();

  constructor(config: InterviewEngineConfig) {
    this.config = config;
    this.context = {
      currentQuestionIndex: -1,
      totalQuestions: config.questions.length,
      currentQuestion: null,
      answers: [],
      startTime: 0,
      questionStartTime: 0,
    };
  }

  /** 获取当前阶段 */
  getStage(): InterviewStage {
    return this.stage;
  }

  /** 获取面试上下文 */
  getContext(): InterviewContext {
    return { ...this.context };
  }

  /**
   * 注册阶段进入回调
   */
  onEnter(stage: InterviewStage, callback: StageCallback): void {
    const list = this.onEnterCallbacks.get(stage) || [];
    list.push(callback);
    this.onEnterCallbacks.set(stage, list);
  }

  /**
   * 注册阶段离开回调
   */
  onLeave(stage: InterviewStage, callback: StageCallback): void {
    const list = this.onLeaveCallbacks.get(stage) || [];
    list.push(callback);
    this.onLeaveCallbacks.set(stage, list);
  }

  /**
   * 触发事件，推进状态机
   *
   * @param event - 面试事件
   */
  async transition(event: InterviewEvent): Promise<void> {
    const nextStage = this.getNextStage(event);
    if (!nextStage) {
      throw new Error(
        `无效的状态转换：在 ${this.stage} 阶段不能触发 ${event} 事件`,
      );
    }

    // 离开回调
    const leaveCallbacks = this.onLeaveCallbacks.get(this.stage) || [];
    for (const cb of leaveCallbacks) {
      await cb(nextStage, this.context);
    }

    this.stage = nextStage;

    // 更新上下文
    this.updateContext(event);

    // 进入回调
    const enterCallbacks = this.onEnterCallbacks.get(this.stage) || [];
    for (const cb of enterCallbacks) {
      await cb(this.stage, this.context);
    }
  }

  /**
   * 记录用户回答
   */
  recordAnswer(answer: string): void {
    const q = this.context.currentQuestion;
    if (q) {
      this.context.answers.push({ questionId: q.id, answer });
    }
  }

  /**
   * 重置引擎
   */
  reset(): void {
    this.stage = 'idle';
    this.context = {
      currentQuestionIndex: -1,
      totalQuestions: this.config.questions.length,
      currentQuestion: null,
      answers: [],
      startTime: 0,
      questionStartTime: 0,
    };
  }

  /** 状态转换表 */
  private getNextStage(event: InterviewEvent): InterviewStage | null {
    const map: Record<
      InterviewStage,
      Partial<Record<InterviewEvent, InterviewStage>>
    > = {
      idle: { START: 'welcome' },
      welcome: { WELCOME_DONE: 'asking' },
      asking: { QUESTION_DELIVERED: 'answering' },
      answering: { ANSWER_RECEIVED: 'evaluating' },
      evaluating: {
        EVALUATION_DONE: 'asking',
        ALL_QUESTIONS_DONE: 'summary',
      },
      summary: { FEEDBACK_DELIVERED: 'score' },
      score: { RESET: 'idle' },
    };
    return map[this.stage]?.[event] ?? null;
  }

  /** 事件触发的上下文更新 */
  private updateContext(event: InterviewEvent): void {
    switch (event) {
      case 'START':
        this.context.startTime = Date.now();
        break;

      case 'WELCOME_DONE':
        this.context.currentQuestionIndex = 0;
        this.context.currentQuestion = this.config.questions[0] || null;
        this.context.questionStartTime = Date.now();
        break;

      case 'EVALUATION_DONE': {
        const nextIndex = this.context.currentQuestionIndex + 1;
        if (nextIndex < this.config.questions.length) {
          this.context.currentQuestionIndex = nextIndex;
          this.context.currentQuestion = this.config.questions[nextIndex];
          this.context.questionStartTime = Date.now();
        }
        break;
      }
    }
  }
}
