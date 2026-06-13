/**
 * evaluate_answer 工具
 *
 * 评估候选人当前回答的质量。结合关键词匹配（本地预筛）
 * 和 LLM 深度分析（语义理解），给出多维度评分和弱点识别。
 */

import type { AgentTool, AgentContext, ToolResult } from '@/types/agent';
import { evaluateAnswerQuality } from '@/utils/scoring';

export const evaluateAnswerTool: AgentTool = {
  name: 'evaluate_answer',
  description: '评估候选人刚刚给出的回答质量。分析覆盖度、深度、逻辑性，输出评分和待追问的薄弱点。应在每次用户回答后调用。',
  parameters: [
    {
      name: 'answer',
      type: 'string',
      description: '候选人的回答文本',
      required: true,
    },
    {
      name: 'question',
      type: 'string',
      description: '当前问题文本',
      required: true,
    },
    {
      name: 'expected_points',
      type: 'string',
      description: '期望回答要点（逗号分隔），如不提供则由 LLM 自动判断',
      required: false,
    },
  ],
  localOnly: false,

  async execute(params: Record<string, unknown>, context: AgentContext): Promise<ToolResult> {
    const answer = (params.answer as string) || '';
    const question = (params.question as string) || '';
    const expectedPointsStr = (params.expected_points as string) || '';

    // 本地预筛：关键词匹配覆盖率
    const expectedPoints = expectedPointsStr
      ? expectedPointsStr.split(/[,，]/).map((s) => s.trim()).filter(Boolean)
      : [];
    const localEval = expectedPoints.length > 0
      ? evaluateAnswerQuality(answer, expectedPoints)
      : null;

    // LLM 深度评估
    const evalPrompt = `你是一位资深面试评估专家。请对下面的回答进行评估。

## 问题
${question}

## 回答
${answer.slice(0, 2000)}

${localEval ? `## 本地预筛结果
- 覆盖率：${Math.round(localEval.coverageRate * 100)}%
- 匹配要点：${localEval.matchedPoints.join('、') || '无'}
- 未匹配要点：${localEval.missedPoints.join('、') || '无'}` : ''}

## 评估要求
请输出严格 JSON：
{
  "overallScore": 7,         // 1-10 综合评分
  "dimensions": {
    "communication": 7,      // 沟通表达 1-10
    "knowledge": 7,          // 专业知识 1-10
    "logic": 7,              // 逻辑思维 1-10
    "adaptability": 7        // 应变能力 1-10
  },
  "strengths": ["具体优点1"],
  "weaknesses": ["具体不足1"],
  "gaps": ["未覆盖的知识点1"],   // 需要追问的薄弱点
  "needsFollowUp": true,       // 是否需要追问
  "followUpDirection": "追问方向建议",
  "isTooShort": false          // 回答是否过短
}`;

    try {
      const result = await context.llmClient.chat([
        { role: 'user', content: evalPrompt },
      ]);

      let evaluation: Record<string, unknown> | null = null;
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try { evaluation = JSON.parse(jsonMatch[0]); } catch { /* fall through */ }
      }

      if (evaluation) {
        const score = evaluation.overallScore as number ?? 5;
        const dims = evaluation.dimensions as Record<string, number> ?? {};
        const strengths = (evaluation.strengths as string[]) ?? [];
        const weaknesses = (evaluation.weaknesses as string[]) ?? [];

        // 更新候选人画像
        if (dims.communication) context.candidateProfile.updateScore('沟通表达', dims.communication);
        if (dims.knowledge) context.candidateProfile.updateScore('专业知识', dims.knowledge);
        if (dims.logic) context.candidateProfile.updateScore('逻辑思维', dims.logic);
        if (dims.adaptability) context.candidateProfile.updateScore('应变能力', dims.adaptability);

        for (const s of strengths) context.candidateProfile.addStrength(s);
        for (const w of weaknesses) context.candidateProfile.addWeakness(w);

        context.candidateProfile.recordAnswer(
          question,
          answer,
          localEval?.coverageRate ?? 0.5,
          score,
        );

        // 记录突出表现
        if (score >= 8) {
          context.episodicMemory.record('significant_answer', `优秀回答：${question.slice(0, 50)}... (${score}/10)`, {
            question,
            score,
            strengths,
          });
        } else if (score <= 3) {
          context.episodicMemory.record('significant_answer', `回答薄弱：${question.slice(0, 50)}... (${score}/10)`, {
            question,
            score,
            weaknesses,
          });
        }

        return {
          success: true,
          data: {
            ...evaluation,
            localCoverage: localEval?.coverageRate ?? null,
          },
          tokens: { input: result.inputTokens, output: result.outputTokens },
        };
      }

      // LLM 返回无效 JSON，使用本地评估降级
      return {
        success: true,
        data: {
          overallScore: localEval ? Math.round(localEval.coverageRate * 10) : 5,
          needsFollowUp: localEval?.needsFollowUp ?? true,
          gaps: localEval?.missedPoints ?? [],
          localFallback: true,
        },
      };
    } catch (err) {
      // 完全降级
      return {
        success: true,
        data: {
          overallScore: 5,
          needsFollowUp: true,
          gaps: [],
          localFallback: true,
          error: err instanceof Error ? err.message : '评估失败',
        },
      };
    }
  },
};
