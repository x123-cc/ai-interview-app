/**
 * ask_question 工具
 *
 * 向候选人提出面试问题。支持播报（TTS）和多轮追问标记。
 */

import type { AgentTool, AgentContext, ToolResult } from '@/types/agent';

export const askQuestionTool: AgentTool = {
  name: 'ask_question',
  description: '向候选人提出一个问题。可以是新问题、追问、或总结性发言。调用后问题会显示在对话界面并可选择语音播报。',
  parameters: [
    {
      name: 'question',
      type: 'string',
      description: '要提问的内容',
      required: true,
    },
    {
      name: 'type',
      type: 'string',
      description: '问题类型',
      required: true,
      enum: ['new_question', 'follow_up', 'greeting', 'closing', 'encouragement'],
    },
    {
      name: 'question_number',
      type: 'number',
      description: '当前问题编号（新问题从1开始递增）',
      required: false,
    },
  ],
  localOnly: false,

  async execute(params: Record<string, unknown>, context: AgentContext): Promise<ToolResult> {
    const question = params.question as string;
    const type = (params.type as string) || 'new_question';
    const questionNumber = params.question_number as number | undefined;

    // 记录到工作记忆
    context.workingMemory.add('agent', question, { type, questionNumber });

    // 触发 TTS 播报
    if (context.onSpeak) {
      context.onSpeak(question);
    }

    // 标记面试开始/结束
    if (type === 'closing') {
      context.episodicMemory.record('interview_milestone', '面试结束', {
        question,
        totalQuestions: questionNumber ?? 0,
      });
    }

    return {
      success: true,
      data: { question, type, questionNumber },
    };
  },
};
