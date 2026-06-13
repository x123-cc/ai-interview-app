/**
 * generate_followup 工具
 *
 * 基于 evaluate_answer 找出的薄弱点，生成精准的追问问题。
 * 追问应自然、深入，针对候选人的知识盲区。
 */

import type { AgentTool, AgentContext, ToolResult } from '@/types/agent';

export const generateFollowupTool: AgentTool = {
  name: 'generate_followup',
  description: '根据回答评估发现的薄弱点，生成一个精准的追问问题。追问应自然流畅，就像面试官在深入探讨。',
  parameters: [
    {
      name: 'gap_area',
      type: 'string',
      description: '需要追问的薄弱领域或知识点',
      required: true,
    },
    {
      name: 'original_question',
      type: 'string',
      description: '原始问题文本（用于上下文）',
      required: true,
    },
    {
      name: 'candidate_answer',
      type: 'string',
      description: '候选人的回答摘要（用于追问针对性）',
      required: false,
    },
  ],
  localOnly: false,

  async execute(params: Record<string, unknown>, context: AgentContext): Promise<ToolResult> {
    const gapArea = params.gap_area as string;
    const originalQuestion = params.original_question as string;
    const candidateAnswer = (params.candidate_answer as string)?.slice(0, 500) ?? '';

    // 如果追问深度为 0，跳过
    if (context.config.followUpDepth === 0) {
      return {
        success: true,
        data: { skipFollowUp: true, reason: '追问深度设置为 0' },
      };
    }

    const depthHint = context.config.followUpDepth === 2
      ? '请做深层追问，挖掘根本原因和底层原理'
      : '请做浅层追问，确认理解并补充细节即可';

    const prompt = `你是一位资深面试官。根据候选人的回答，生成一个自然的追问。

## 原始问题
${originalQuestion}

## 候选人的回答
${candidateAnswer || '（未提供）'}

## 需要追问的薄弱领域
${gapArea}

## 追问策略
${depthHint}
- 追问应该自然、流畅，像真正的对话
- 每次追问 30-60 字
- 语言：中文
- 不要暴露"我发现你没答上来XXX"，而是自然地深入探讨

## 输出格式
纯文本追问内容（不要 JSON）。`;

    try {
      const result = await context.llmClient.chat([
        { role: 'user', content: prompt },
      ]);

      const followUp = result.content.trim();

      // 记录追问历史
      context.workingMemory.add('system', `[追问生成] 针对 "${gapArea}" → "${followUp}"`);

      return {
        success: true,
        data: {
          followUp,
          gapArea,
          depth: context.config.followUpDepth,
        },
        tokens: { input: result.inputTokens, output: result.outputTokens },
      };
    } catch (err) {
      return {
        success: false,
        error: `追问生成失败：${err instanceof Error ? err.message : '未知错误'}`,
      };
    }
  },
};
