/** 单次 API 调用记录 */
export interface CostEntry {
  /** 调用时间戳 */
  timestamp: number;
  /** 服务类型 */
  service: 'llm' | 'whisper';
  /** 模型名称 */
  model: string;
  /** 输入 token 数 */
  inputTokens: number;
  /** 输出 token 数 */
  outputTokens: number;
  /** 图片数量（仅 LLM 多模态调用） */
  imageCount: number;
  /** 预估费用（美元） */
  estimatedCost: number;
}

/** 各模型定价（美元 / 1K tokens） */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 0.005, output: 0.015 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'claude-3-opus': { input: 0.015, output: 0.075 },
  'claude-3-sonnet': { input: 0.003, output: 0.015 },
  'claude-3-haiku': { input: 0.00025, output: 0.00125 },
};

/** 图片费用（美元 / 张），GPT-4o 低分辨率 */
const IMAGE_COST = 0.00085;

/**
 * 估算 LLM 调用费用
 *
 * @param model - 模型名称
 * @param inputTokens - 输入 token 数
 * @param outputTokens - 输出 token 数
 * @param imageCount - 图片数量
 * @returns 预估费用（美元）
 */
function estimateLLMCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  imageCount: number,
): number {
  const pricing = MODEL_PRICING[model] ?? MODEL_PRICING['gpt-4o'];
  const textCost =
    (inputTokens / 1000) * pricing.input +
    (outputTokens / 1000) * pricing.output;
  const imgCost = imageCount * IMAGE_COST;
  return Math.round((textCost + imgCost) * 10000) / 10000;
}

/**
 * API 调用成本追踪器
 *
 * 记录每次 LLM / Whisper 调用的 token 消耗和费用，
 * 提供会话级和全局级费用汇总。
 */
export class CostTracker {
  private entries: CostEntry[] = [];

  /**
   * 记录一次 LLM 调用
   */
  recordLLMCall(
    model: string,
    inputTokens: number,
    outputTokens: number,
    imageCount = 0,
  ): void {
    const estimatedCost = estimateLLMCost(
      model,
      inputTokens,
      outputTokens,
      imageCount,
    );
    this.entries.push({
      timestamp: Date.now(),
      service: 'llm',
      model,
      inputTokens,
      outputTokens,
      imageCount,
      estimatedCost,
    });
  }

  /**
   * 记录一次 Whisper 调用
   *
   * Whisper 定价：$0.006 / 分钟
   */
  recordWhisperCall(durationSeconds: number): void {
    const minutes = durationSeconds / 60;
    const estimatedCost = Math.round(minutes * 0.006 * 10000) / 10000;
    this.entries.push({
      timestamp: Date.now(),
      service: 'whisper',
      model: 'whisper-1',
      inputTokens: 0,
      outputTokens: 0,
      imageCount: 0,
      estimatedCost,
    });
  }

  /**
   * 获取当前会话总费用
   */
  getSessionCost(): number {
    return (
      Math.round(
        this.entries.reduce((sum, e) => sum + e.estimatedCost, 0) * 10000,
      ) / 10000
    );
  }

  /**
   * 获取按服务分类的费用明细
   */
  getCostBreakdown(): { llm: number; whisper: number } {
    return {
      llm: this.sumByService('llm'),
      whisper: this.sumByService('whisper'),
    };
  }

  /**
   * 获取所有调用记录
   */
  getEntries(): CostEntry[] {
    return [...this.entries];
  }

  /**
   * 获取调用次数
   */
  getCallCount(): number {
    return this.entries.length;
  }

  /**
   * 获取总 token 消耗
   */
  getTotalTokens(): { input: number; output: number } {
    return {
      input: this.entries.reduce((s, e) => s + e.inputTokens, 0),
      output: this.entries.reduce((s, e) => s + e.outputTokens, 0),
    };
  }

  /**
   * 重置当前会话
   */
  reset(): void {
    this.entries = [];
  }

  private sumByService(service: 'llm' | 'whisper'): number {
    return (
      Math.round(
        this.entries
          .filter((e) => e.service === service)
          .reduce((sum, e) => sum + e.estimatedCost, 0) * 10000,
      ) / 10000
    );
  }
}
