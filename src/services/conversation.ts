import type { LLMTextMessage } from '@/types';

/** 对话管理器配置 */
export interface ConversationConfig {
  /** 最大 token 数（估算值），默认 8000 */
  maxTokens?: number;
  /** 最少保留的最近轮数 */
  minRecentRounds?: number;
}

/** 单轮对话 */
interface ConversationTurn {
  user: string;
  assistant: string;
  imageBase64?: string;
}

/**
 * 对话管理器
 *
 * 管理面试过程中的对话历史，包括消息存储、上下文构建、
 * token 估算和超长上下文的自动裁剪。
 */
export class ConversationManager {
  private systemPrompt: string;
  private turns: ConversationTurn[] = [];
  private maxTokens: number;
  private minRecentRounds: number;

  constructor(systemPrompt: string, config: ConversationConfig = {}) {
    this.systemPrompt = systemPrompt;
    this.maxTokens = config.maxTokens ?? 8000;
    this.minRecentRounds = config.minRecentRounds ?? 3;
  }

  /**
   * 添加用户消息（等待 AI 回复）
   */
  addUserMessage(text: string, imageBase64?: string): void {
    this.turns.push({ user: text, assistant: '', imageBase64 });
  }

  /**
   * 设置最后一条用户消息对应的 AI 回复
   */
  setAssistantReply(text: string): void {
    const lastTurn = this.turns[this.turns.length - 1];
    if (lastTurn && lastTurn.assistant === '') {
      lastTurn.assistant = text;
    }
  }

  /**
   * 估算文本 token 数（粗略估算：1 token ≈ 3 字符）
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 3);
  }

  /**
   * 计算当前总 token 估算值
   */
  getEstimatedTokens(): number {
    let total = this.estimateTokens(this.systemPrompt);
    for (const turn of this.turns) {
      total += this.estimateTokens(turn.user);
      total += this.estimateTokens(turn.assistant);
      // 图片粗略估算 200 token/张
      if (turn.imageBase64) total += 200;
    }
    return total;
  }

  /**
   * 裁剪最早的对话轮次，确保不超过 maxTokens
   *
   * 至少保留 minRecentRounds 轮，多余的最早轮次被移除。
   * 裁剪后会在 system prompt 之后追加裁剪标记告知 AI。
   */
  trimContext(): void {
    while (
      this.getEstimatedTokens() > this.maxTokens &&
      this.turns.length > this.minRecentRounds
    ) {
      this.turns.shift();
    }
  }

  /**
   * 构建发送给 LLM 的完整消息列表
   *
   * 包含 system prompt + 对话历史（自动裁剪）。
   */
  buildMessages(): LLMTextMessage[] {
    this.trimContext();

    const messages: LLMTextMessage[] = [];

    // System Prompt
    messages.push({ role: 'system', content: this.systemPrompt });

    // 对话历史
    for (const turn of this.turns) {
      if (turn.user) {
        messages.push({ role: 'user', content: turn.user });
      }
      if (turn.assistant) {
        messages.push({
          role: 'assistant',
          content: turn.assistant,
        });
      }
    }

    return messages;
  }

  /**
   * 获取最后一次用户消息的图片（用于多模态请求）
   */
  getLastImage(): string | undefined {
    const lastTurn = this.turns[this.turns.length - 1];
    return lastTurn?.imageBase64;
  }

  /**
   * 获取对话轮数
   */
  getTurnCount(): number {
    return this.turns.length;
  }

  /**
   * 重置对话（开始新面试）
   */
  reset(): void {
    this.turns = [];
  }

  /**
   * 获取对话摘要（用于评分和反馈）
   */
  getSummary(): string {
    return this.turns
      .map(
        (t, i) =>
          `Q${i + 1}: ${t.user.slice(0, 100)}\nA${i + 1}: ${t.assistant.slice(0, 200)}`,
      )
      .join('\n\n');
  }
}
