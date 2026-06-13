/**
 * analyze_vision 工具
 *
 * 分析摄像头画面，检测候选人状态：
 * - 是否在看屏幕
 * - 是否有作弊嫌疑
 * - 情绪状态
 * - 是否需要安抚
 */

import type { AgentTool, AgentContext, ToolResult } from '@/types/agent';

export const analyzeVisionTool: AgentTool = {
  name: 'analyze_vision',
  description: '分析摄像头截图，判断候选人是否在注视屏幕、是否有异常行为、当前情绪状态。当需要视觉监控或检测作弊时调用。',
  parameters: [
    {
      name: 'image_base64',
      type: 'string',
      description: '摄像头截图的 base64 编码',
      required: true,
    },
  ],
  localOnly: false,

  async execute(params: Record<string, unknown>, context: AgentContext): Promise<ToolResult> {
    const imageBase64 = params.image_base64 as string;

    if (!imageBase64) {
      return { success: false, error: '未提供摄像头画面' };
    }

    if (!context.config.visionEnabled) {
      return {
        success: true,
        data: { visionDisabled: true, message: '视觉监控未启用' },
      };
    }

    const visionPrompt = `分析这张面试截图，输出严格 JSON：

{
  "lookingAtScreen": true/false,
  "suspiciousBehavior": true/false,
  "suspicionDetail": "如果有嫌疑，描述具体行为",
  "emotion": "calm/nervous/confident/uncertain/neutral",
  "needsReassurance": true/false,
  "suggestion": "如果发现异常，给出面试官应对建议"
}

规则：
- 候选人注视屏幕 = 正常
- 频繁看别处/低头/离开画面/画面中出现他人 = 可疑
- 表情僵硬/皱眉/频繁摸脸 = 紧张
- 放松/微笑 = 自信`;

    try {
      const result = await context.llmClient.chatWithImage(
        [{ role: 'user', content: visionPrompt }],
        imageBase64,
      );

      let visionData: Record<string, unknown> | null = null;
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try { visionData = JSON.parse(jsonMatch[0]); } catch { /* fall through */ }
      }

      if (visionData) {
        // 更新候选人情绪趋势
        const emotion = visionData.emotion as string;
        if (emotion) {
          context.candidateProfile.recordEmotion(emotion);
        }

        // 记录作弊标记
        if (visionData.suspiciousBehavior) {
          context.candidateProfile.flagCheating();
          context.episodicMemory.record(
            'cheating_alert',
            `视觉检测到可疑行为：${visionData.suspicionDetail || '未指定'}`,
            visionData,
          );
        }

        // 记录情绪转折
        const trend = context.candidateProfile.emotionTrend;
        if (trend.length >= 2) {
          const prev = trend[trend.length - 2].emotion;
          const curr = emotion;
          if (prev !== curr && (curr === 'nervous' || curr === 'confident')) {
            context.episodicMemory.record(
              'emotional_shift',
              `情绪转变：${prev} → ${curr}`,
              { from: prev, to: curr, timestamp: Date.now() },
            );
          }
        }

        return {
          success: true,
          data: visionData,
          tokens: { input: result.inputTokens, output: result.outputTokens },
        };
      }

      // 解析失败，保守处理
      return {
        success: true,
        data: {
          lookingAtScreen: true,
          suspiciousBehavior: false,
          emotion: 'neutral',
          needsReassurance: false,
          parseFailed: true,
        },
      };
    } catch (err) {
      return {
        success: true,
        data: {
          lookingAtScreen: true,
          suspiciousBehavior: false,
          emotion: 'neutral',
          needsReassurance: false,
          error: err instanceof Error ? err.message : '分析失败',
        },
      };
    }
  },
};
