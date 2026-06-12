import type { LLMClient, LLMTextMessage, ChatMessage } from '@/types';

// ── Types ──

export interface InterviewAIConfig {
  llmClient: LLMClient;
  /** 简历文本 */
  resume: string;
  /** JD 文本（面试模式） */
  jd?: string;
  /** 复盘模式：预解析的问题列表 */
  questions?: string[];
  /** 复盘模式：上下文 */
  context?: string;
  /** 面试模式 */
  mode: 'interview' | 'review';
}

export interface VisionAnalysis {
  /** 候选人是否在看屏幕 */
  lookingAtScreen: boolean;
  /** 是否有作弊嫌疑 */
  suspiciousBehavior: boolean;
  /** 嫌疑描述 */
  suspicionDetail?: string;
  /** 情绪状态 */
  emotion: 'calm' | 'nervous' | 'confident' | 'uncertain' | 'neutral';
  /** 是否需要安抚 */
  needsReassurance: boolean;
}

export interface InterviewResponse {
  /** AI 的文本回复 */
  text: string;
  /** 视觉分析结果（如果有发送图片） */
  vision?: VisionAnalysis;
  /** 当前问题编号（从 1 开始） */
  questionNumber: number;
  /** 是否已问完所有问题 */
  isComplete: boolean;
}

// ── System Prompt Builder ──

function buildSystemPrompt(config: InterviewAIConfig): string {
  const { resume, jd, questions, context, mode } = config;

  const resumeExcerpt = resume.slice(0, 3000);

  if (mode === 'review') {
    const questionList = questions?.map((q, i) => `${i + 1}. ${q}`).join('\n') ?? '';
    return `你是一位专业、友善的 AI 面试官，正在进行一场复盘面试。

## 你的核心职责
1. **面试提问**：按照以下从历史记录中提取的问题，逐一进行提问和追问
2. **视觉监控**：通过摄像头画面观察候选人，检测是否有作弊行为
3. **情绪感知**：观察候选人的表情和肢体语言，给予适当安抚

## 候选人简历
${resumeExcerpt}

## 复盘上下文
${context?.slice(0, 2000) ?? '无'}

## 要提问的问题（按顺序）
${questionList}

## 视觉监控规则
当我发送摄像头画面时，你需要分析画面并判断：
- 候选人是否在注视屏幕（还是频繁看向别处）
- 是否有异常行为（如频繁低头、转头、离开画面、画面中出现他人）
- 候选人的情绪状态（紧张、自信、犹豫、平静）

**作弊判定标准**：
- 频繁眼神飘忽（连续多次回答时看向屏幕外）→ 轻度嫌疑
- 长时间低头不面对屏幕 → 中度嫌疑
- 画面中出现其他人或候选人离开 → 高度嫌疑
- 发现嫌疑时，语气坚定但不失礼貌地提醒

**情绪安抚标准**：
- 候选人表现出紧张（语速快、声音颤抖、表情僵硬）→ 说一句安抚的话，如"放轻松，这只是一次练习"
- 候选人表现出自信 → 适当给予肯定
- 候选人表现出犹豫 → 给予提示或换个角度提问

## 对话规则
1. 每次只问一个问题或追问一个点
2. 回答简洁专业，每次 60-100 字
3. 根据候选人的回答质量决定追问还是进入下一题
4. 完成所有问题后说"面试结束，感谢你的参与"
5. 不要在对话中暴露你的分析结果（如"我发现你在看别处"），而是自然提醒
6. 面试语言：中文

## 输出格式（极其重要）
如果你同时收到文字和图片，你的回复必须是一个 JSON 对象：
{
  "text": "你的面试对话文本",
  "vision": {
    "lookingAtScreen": true/false,
    "suspiciousBehavior": true/false,
    "suspicionDetail": "嫌疑描述（无嫌疑则为空）",
    "emotion": "calm/nervous/confident/uncertain/neutral",
    "needsReassurance": true/false
  },
  "questionNumber": 当前题号,
  "isComplete": false
}

如果只收到文字不含图片，只回复纯文本即可，不需要 JSON。
当所有问题问完时，isComplete 设为 true，text 为结束语。`;
  }

  // 面试模式
  return `你是一位专业、友善的 AI 面试官，正在进行一场模拟面试。

## 你的核心职责
1. **动态提问**：根据候选人简历和岗位 JD，灵活生成面试问题
2. **追问深入**：根据候选人回答质量，深入追问技术细节或行为细节
3. **视觉监控**：通过摄像头画面观察候选人，检测是否有作弊行为
4. **情绪感知**：观察候选人的表情和肢体语言，给予适当安抚

## 候选人简历
${resumeExcerpt}

## 目标岗位 JD
${jd?.slice(0, 3000) ?? '未提供'}

## 面试策略
1. 开场：先让候选人做简短自我介绍
2. 技术/专业能力：根据简历和 JD，问 3-5 个技术或专业问题，由浅入深
3. 项目经验：针对简历中的项目经历追问细节
4. 综合素质：考察沟通、解决问题的能力
5. 收尾：总结面试，给予反馈

## 视觉监控规则
当我发送摄像头画面时，你需要分析画面并判断：
- 候选人是否在注视屏幕（还是频繁看向别处）
- 是否有异常行为（如频繁低头、转头、离开画面、画面中出现他人）
- 候选人的情绪状态（紧张、自信、犹豫、平静）

**作弊判定标准**：
- 频繁眼神飘忽（连续多次回答时看向屏幕外）→ 轻度嫌疑
- 长时间低头不面对屏幕 → 中度嫌疑
- 画面中出现其他人或候选人离开 → 高度嫌疑
- 发现嫌疑时，语气坚定但不失礼貌地提醒

**情绪安抚标准**：
- 候选人表现出紧张（语速快、声音颤抖、表情僵硬）→ 说一句安抚的话
- 候选人表现出自信 → 适当给予肯定
- 候选人表现出犹豫 → 给予提示或换个角度

## 对话规则
1. 每次只问一个问题或追问一个点
2. 回答简洁专业，每次 60-100 字
3. 根据回答质量灵活决定追问还是进入下一题
4. 所有问题问完后说"面试结束，感谢你的参与"
5. 不要在对话中暴露你的分析结果，而是自然地提醒或安抚
6. 面试语言：中文

## 输出格式（极其重要）
如果你同时收到文字和图片，你的回复必须是一个 JSON 对象：
{
  "text": "你的面试对话文本",
  "vision": {
    "lookingAtScreen": true/false,
    "suspiciousBehavior": true/false,
    "suspicionDetail": "嫌疑描述（无嫌疑则为空）",
    "emotion": "calm/nervous/confident/uncertain/neutral",
    "needsReassurance": true/false
  },
  "questionNumber": 当前题号,
  "isComplete": false
}

如果只收到文字不含图片，只回复纯文本即可，不需要 JSON。
当所有问题问完时，isComplete 设为 true，text 为结束语。`;
}

// ── Main Interview AI Class ──

export class InterviewAI {
  private config: InterviewAIConfig;
  private systemPrompt: string;
  private conversation: Array<{ role: 'user' | 'assistant'; text: string; hasImage?: boolean }> = [];
  private questionNumber = 0;

  constructor(config: InterviewAIConfig) {
    this.config = config;
    this.systemPrompt = buildSystemPrompt(config);
  }

  /**
   * 从已有对话历史恢复状态（继续未完成的面试）
   */
  resumeFrom(transcript: ChatMessage[]): string {
    // 恢复对话历史
    for (const msg of transcript) {
      const role = msg.role === 'user' ? 'user' : 'assistant';
      this.conversation.push({ role, text: msg.text });
    }
    // 估算当前题号
    const questionCount = transcript.filter(
      (m) => m.role === 'interviewer' && m.text.includes('?')
    ).length;
    this.questionNumber = Math.max(1, questionCount);

    return `面试继续。刚才我们进行到第 ${this.questionNumber} 个问题。请根据之前的对话上下文，继续问我下一个问题。先做一个简短回顾，然后继续提问。`;
  }

  /** 获取开场白 */
  getWelcomeMessage(): string {
    const name = this.config.mode === 'review' ? '复盘面试' : '模拟面试';
    return `你好！欢迎参加${name}。我已阅读了你的简历${
      this.config.jd ? '和岗位要求' : ''
    }，准备好后请开始做自我介绍吧。`;
  }

  /**
   * 处理用户回答 + 可选的摄像头画面
   * 返回 AI 回复 + 视觉分析
   */
  async processTurn(
    userText: string,
    imageBase64?: string,
  ): Promise<InterviewResponse> {
    // 构建消息列表
    const messages: LLMTextMessage[] = [
      { role: 'system', content: this.systemPrompt },
    ];

    // 添加对话历史（最近 10 轮，避免上下文过长）
    const recentHistory = this.conversation.slice(-10);
    for (const turn of recentHistory) {
      messages.push({
        role: turn.role === 'user' ? 'user' : 'assistant',
        content: turn.text,
      });
    }

    // 添加当前用户消息
    messages.push({ role: 'user', content: userText });

    // 记录用户消息
    this.conversation.push({ role: 'user', text: userText, hasImage: !!imageBase64 });

    try {
      let result;

      if (imageBase64) {
        // 多模态：文字 + 图片
        result = await this.config.llmClient.chatWithImage(
          messages,
          imageBase64,
        );
      } else {
        // 纯文字
        result = await this.config.llmClient.chat(messages);
      }

      const content = result.content;

      // 尝试解析 JSON（当有图片时）
      if (imageBase64) {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[0]);
            const response: InterviewResponse = {
              text: parsed.text || content,
              vision: parsed.vision,
              questionNumber: parsed.questionNumber || this.questionNumber,
              isComplete: parsed.isComplete || false,
            };
            if (parsed.questionNumber) {
              this.questionNumber = parsed.questionNumber;
            }
            this.conversation.push({ role: 'assistant', text: response.text });
            return response;
          } catch {
            // JSON 解析失败，使用原始文本
          }
        }
      }

      // 纯文本或无图片的情况
      const response: InterviewResponse = {
        text: content.trim(),
        questionNumber: this.questionNumber,
        isComplete: content.includes('面试结束'),
      };

      this.conversation.push({ role: 'assistant', text: response.text });
      return response;
    } catch (err) {
      console.error('InterviewAI processTurn error:', err);
      // 降级回复
      const fallback = '好的，我理解了。请继续你的回答。';
      this.conversation.push({ role: 'assistant', text: fallback });
      return {
        text: fallback,
        questionNumber: this.questionNumber,
        isComplete: false,
      };
    }
  }

  /** 获取对话历史 */
  getHistory(): ChatMessage[] {
    return this.conversation.map((turn) => ({
      role: turn.role === 'user' ? 'user' : 'interviewer',
      text: turn.text,
      timestamp: Date.now(),
    }));
  }

  /** 重置对话 */
  reset(): void {
    this.conversation = [];
    this.questionNumber = 0;
  }
}

/**
 * 快速客户端视觉预检（不调用 API，纯浏览器端）
 *
 * 通过已有的帧差异数据判断候选人是否可能离开屏幕。
 * 这是一个粗略的预筛选，准确分析由 LLM 多模态完成。
 */
export interface QuickVisionCheck {
  /** 画面是否显著变化（可能离开） */
  significantChange: boolean;
  /** 画面中是否疑似无人 */
  possibleAbsence: boolean;
  /** 建议：是否值得发送给 LLM 分析 */
  shouldSendToAI: boolean;
}

/**
 * 基于帧差异和历史模式做客户端预检
 *
 * @param frameDiff - 当前帧与上一帧的差异度 (0-1)
 * @param historyDiffs - 最近 N 帧的差异记录
 * @param consecutiveHighDiff - 连续高差异帧数
 */
export function quickVisionCheck(
  frameDiff: number,
  historyDiffs: number[],
  consecutiveHighDiff: number,
): QuickVisionCheck {
  const avgDiff =
    historyDiffs.length > 0
      ? historyDiffs.reduce((a, b) => a + b, 0) / historyDiffs.length
      : frameDiff;

  // 当前帧差异远高于平均值 → 显著变化
  const significantChange = frameDiff > avgDiff * 2 && frameDiff > 0.3;

  // 连续多帧高差异 → 可能离开
  const possibleAbsence = consecutiveHighDiff >= 3;

  // 值得发送给 AI 的条件
  const shouldSendToAI = significantChange || possibleAbsence;

  return { significantChange, possibleAbsence, shouldSendToAI };
}
