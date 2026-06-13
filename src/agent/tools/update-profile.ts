/**
 * update_profile 工具
 *
 * 更新候选人动态画像。Agent 在评估回答后调用此工具
 * 持久化候选人的能力变化和状态更新。
 *
 * 此工具主要做本地操作（记忆更新），也可触发 LLM 重新评估全局画像。
 */

import type { AgentTool, AgentContext, ToolResult } from '@/types/agent';

export const updateProfileTool: AgentTool = {
  name: 'update_profile',
  description: '更新候选人的动态画像，包括强项、弱项、各维度评分。在每次 evaluate_answer 后自动调用。',
  parameters: [
    {
      name: 'action',
      type: 'string',
      description: '更新动作',
      required: true,
      enum: ['add_strength', 'add_weakness', 'update_scores', 'record_emotion', 'summarize'],
    },
    {
      name: 'data',
      type: 'string',
      description: '更新数据的 JSON 字符串，格式取决于 action',
      required: true,
    },
  ],
  localOnly: true,

  async execute(params: Record<string, unknown>, context: AgentContext): Promise<ToolResult> {
    const action = params.action as string;
    let data: Record<string, unknown> = {};

    try {
      data = typeof params.data === 'string' ? JSON.parse(params.data) : (params.data as Record<string, unknown>) ?? {};
    } catch {
      return { success: false, error: 'data 参数 JSON 解析失败' };
    }

    switch (action) {
      case 'add_strength': {
        const s = data.label as string;
        if (s) context.candidateProfile.addStrength(s);
        return { success: true, data: { added: s } };
      }

      case 'add_weakness': {
        const w = data.label as string;
        if (w) context.candidateProfile.addWeakness(w);
        return { success: true, data: { added: w } };
      }

      case 'update_scores': {
        const scores = data.scores as Record<string, number> | undefined;
        if (scores) {
          for (const [dim, score] of Object.entries(scores)) {
            context.candidateProfile.updateScore(dim, score);
          }
        }
        return { success: true, data: { updated: Object.keys(scores ?? {}) } };
      }

      case 'record_emotion': {
        const emotion = data.emotion as string;
        if (emotion) context.candidateProfile.recordEmotion(emotion);
        return { success: true, data: { emotion } };
      }

      case 'summarize': {
        const summary = context.candidateProfile.getSummary();
        context.workingMemory.add('system', `[画像摘要]\n${summary}`);
        return { success: true, data: { summary } };
      }

      default:
        return { success: false, error: `未知的更新动作：${action}` };
    }
  },
};
