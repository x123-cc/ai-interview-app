/**
 * generate_report 工具
 *
 * 在面试结束时，汇总生成结构化面试报告：
 * - 4 维度评分
 * - 强项/弱项
 * - 逐题回顾
 * - 改进建议
 * - 关键事件时间线
 */

import type { AgentTool, AgentContext, ToolResult } from '@/types/agent';
import { parseScoresFromJSON } from '@/utils/scoring';

export const generateReportTool: AgentTool = {
  name: 'generate_report',
  description: '生成最终的面试评估报告。汇总所有回答的表现，给出4维度评分、强弱项汇总和改进建议。仅在面试结束时调用。',
  parameters: [
    {
      name: 'conversation_summary',
      type: 'string',
      description: '对话摘要（由 Agent 内部生成）',
      required: true,
    },
  ],
  localOnly: false,

  async execute(params: Record<string, unknown>, context: AgentContext): Promise<ToolResult> {
    const conversationSummary = params.conversation_summary as string;

    const profile = context.candidateProfile;
    const profileSummary = profile.getSummary();

    // 构建评分 prompt
    const reportPrompt = `你是一位资深面试评估专家。请根据以下面试对话和候选人画像，生成最终面试报告。

## 候选人动态画像
${profileSummary}

## 对话记录摘要
${conversationSummary}

## 情景记忆
${context.episodicMemory.getSummaryForReport()}

## 评估要求
请从以下维度评分（每项 1-10 分）并给出详细评语：

1. **沟通表达**：清晰度、流畅度、结构化表达能力
2. **专业知识**：技术/业务深度、知识广度、行业洞察
3. **逻辑思维**：分析框架、推理严谨性、问题拆解能力
4. **应变能力**：追问反应、新场景适应、压力应对

## 输出格式（严格 JSON）
{
  "dimensions": [
    {"name": "沟通表达", "score": 7, "comment": "具体评语"},
    {"name": "专业知识", "score": 8, "comment": "具体评语"},
    {"name": "逻辑思维", "score": 6, "comment": "具体评语"},
    {"name": "应变能力", "score": 7, "comment": "具体评语"}
  ],
  "summary": "200字以内的综合评价",
  "highlights": ["亮点1", "亮点2"],
  "improvements": ["改进建议1", "改进建议2"],
  "overallScore": 7.0
}`;

    try {
      const result = await context.llmClient.chat([
        { role: 'user', content: reportPrompt },
      ]);

      const parsed = parseScoresFromJSON(result.content);

      if (parsed) {
        // 尝试提取额外字段
        let highlights: string[] = [];
        let improvements: string[] = [];
        const jsonMatch = result.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const extra = JSON.parse(jsonMatch[0]);
            highlights = extra.highlights ?? [];
            improvements = extra.improvements ?? [];
          } catch { /* ignore */ }
        }

        return {
          success: true,
          data: {
            ...parsed,
            highlights,
            improvements,
            candidateProfile: profile.toJSON(),
            episodicSummary: context.episodicMemory.getSummaryForReport(),
          },
          tokens: { input: result.inputTokens, output: result.outputTokens },
        };
      }

      // 降级：使用候选画像的分数
      const dimScores = profile.dimensionScores;
      const fallbackDims = [
        { name: '沟通表达', score: dimScores['沟通表达'] || 5, comment: '基于面试表现评估' },
        { name: '专业知识', score: dimScores['专业知识'] || 5, comment: '基于面试表现评估' },
        { name: '逻辑思维', score: dimScores['逻辑思维'] || 5, comment: '基于面试表现评估' },
        { name: '应变能力', score: dimScores['应变能力'] || 5, comment: '基于面试表现评估' },
      ];
      const total = fallbackDims.reduce((s, d) => s + d.score * 0.25, 0);

      return {
        success: true,
        data: {
          dimensions: fallbackDims,
          totalScore: Math.round(total * 10) / 10,
          summary: profileSummary || '面试完成',
          strengths: profile.strengths,
          weaknesses: profile.weaknesses,
          isFallback: true,
        },
      };
    } catch (err) {
      return {
        success: false,
        error: `报告生成失败：${err instanceof Error ? err.message : '未知错误'}`,
      };
    }
  },
};
