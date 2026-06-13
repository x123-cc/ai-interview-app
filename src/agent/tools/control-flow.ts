/**
 * control_flow 工具
 *
 * Agent 的流程控制中枢。在每个决策点调用，告诉系统
 * 下一步应做什么：继续提问 / 追问 / 进入下一题 / 结束面试。
 *
 * 这是 Agent 自主决策的核心体现——由 LLM 根据当前状态
 * 自行判断面试流程的推进方向，而非硬编码的规则引擎。
 */

import type { AgentTool, AgentContext, ToolResult } from '@/types/agent';

export const controlFlowTool: AgentTool = {
  name: 'control_flow',
  description: '决定面试流程的下一步。根据当前评估结果、候选人画像和剩余时间，自主判断：进入下一题、追问当前题、跳过当前题、或结束面试。',
  parameters: [
    {
      name: 'action',
      type: 'string',
      description: '流程控制动作',
      required: true,
      enum: ['next_question', 'follow_up', 'skip_question', 'end_interview', 'encourage_then_continue'],
    },
    {
      name: 'reason',
      type: 'string',
      description: '做出此决策的原因',
      required: true,
    },
    {
      name: 'metadata',
      type: 'string',
      description: '附加决策数据的 JSON',
      required: false,
    },
  ],
  localOnly: true,

  async execute(params: Record<string, unknown>, context: AgentContext): Promise<ToolResult> {
    const action = params.action as string;
    const reason = params.reason as string;

    let metadata: Record<string, unknown> = {};
    try {
      metadata = typeof params.metadata === 'string'
        ? JSON.parse(params.metadata)
        : (params.metadata as Record<string, unknown>) ?? {};
    } catch { /* ignore */ }

    // 记录决策
    context.workingMemory.add('system', `[流程决策] ${action} - ${reason}`);

    // 根据决策执行副作用
    switch (action) {
      case 'next_question': {
        const nextNum = (metadata.questionNumber as number) || 1;
        context.workingMemory.add('system', `进入第 ${nextNum} 题`);
        break;
      }
      case 'follow_up': {
        const direction = metadata.direction as string || reason;
        context.workingMemory.add('system', `追问方向：${direction}`);
        break;
      }
      case 'skip_question': {
        const skippedNum = metadata.questionNumber as number;
        context.workingMemory.add('system', `跳过第 ${skippedNum ?? '?'} 题，原因：${reason}`);
        break;
      }
      case 'end_interview': {
        context.workingMemory.add('system', `面试结束，原因：${reason}`);
        context.episodicMemory.record('interview_milestone', 'Agent 自主决定结束面试', {
          reason,
          profile: context.candidateProfile.toJSON(),
        });
        break;
      }
      case 'encourage_then_continue': {
        context.workingMemory.add('system', `安抚候选人后继续，原因：${reason}`);
        break;
      }
    }

    return {
      success: true,
      data: {
        action,
        reason,
        requiresFollowUp: action === 'follow_up',
        isComplete: action === 'end_interview',
        requiresNextQuestion: action === 'next_question' || action === 'skip_question',
      },
    };
  },
};
