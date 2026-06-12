import { transcribeWithWhisper, type WhisperConfig } from './stt';

/** 语音识别来源 */
export type SpeechSource = 'local' | 'cloud';

/** 语音识别最终结果 */
export interface SpeechRecognitionResult {
  /** 识别文本 */
  text: string;
  /** 识别来源：本地 Web Speech API 或云端 Whisper */
  source: SpeechSource;
  /** 识别置信度 */
  confidence: number;
  /** 云端调用耗时（毫秒），本地为 0 */
  cloudLatency: number;
  /** 云端调用预估费用（美元），本地为 0 */
  cloudCost: number;
}

/** 降级决策配置 */
export interface FallbackConfig {
  /** 置信度阈值 0-1，低于此值时触发云端兜底 */
  confidenceThreshold: number;
  /** Whisper API 配置 */
  whisperConfig: WhisperConfig;
}

/**
 * 语音识别服务
 *
 * 组合本地 Web Speech API 和云端 Whisper API，实现端云协同识别。
 * 本地识别置信度不足时自动降级到云端高精度识别。
 */
export class SpeechService {
  private fallbackConfig: FallbackConfig;

  constructor(fallbackConfig: FallbackConfig) {
    this.fallbackConfig = fallbackConfig;
  }

  /**
   * 评估本地识别结果，决定是否需要云端兜底
   *
   * @param transcript - 本地识别的文本
   * @param confidence - 本地识别的置信度（0-1）
   * @returns 是否需要云端兜底
   */
  needsFallback(confidence: number): boolean {
    return confidence < this.fallbackConfig.confidenceThreshold;
  }

  /**
   * 执行语音识别（优先本地，必要时云端兜底）
   *
   * 决策流程：
   * 1. 若本地识别置信度足够 → 直接返回本地结果
   * 2. 若置信度不足且有音频 → 调用 Whisper API 兜底
   * 3. 若无音频 blob → 返回本地结果（尽最大努力）
   *
   * @param localTranscript - 本地 STT 识别的文本
   * @param localConfidence - 本地识别的置信度
   * @param audioBlob - 原始音频数据（用于云端兜底），可选
   * @returns 最终识别结果，包含来源标记和成本信息
   */
  async recognize(
    localTranscript: string,
    localConfidence: number,
    audioBlob?: Blob,
  ): Promise<SpeechRecognitionResult> {
    // 本地置信度足够，直接使用
    if (!this.needsFallback(localConfidence)) {
      return {
        text: localTranscript,
        source: 'local',
        confidence: localConfidence,
        cloudLatency: 0,
        cloudCost: 0,
      };
    }

    // 置信度不足但没有音频，降级返回本地结果
    if (!audioBlob || audioBlob.size === 0) {
      return {
        text: localTranscript,
        source: 'local',
        confidence: localConfidence,
        cloudLatency: 0,
        cloudCost: 0,
      };
    }

    // 置信度不足，调用云端兜底
    const startTime = performance.now();

    try {
      const result = await transcribeWithWhisper(
        audioBlob,
        this.fallbackConfig.whisperConfig,
      );

      const cloudLatency = Math.round(performance.now() - startTime);
      // 粗略费用估算：Whisper $0.006/分钟，每段按 5 秒估算约 $0.0005
      const cloudCost =
        Math.round(
          ((audioBlob.size / 1024 / 10) * 0.006 + Number.EPSILON) * 10000,
        ) / 10000;

      return {
        text: result.text || localTranscript,
        source: 'cloud',
        confidence: 0.95, // Whisper 通常有较高置信度
        cloudLatency,
        cloudCost,
      };
    } catch {
      // 云端调用失败，降级返回本地结果
      const cloudLatency = Math.round(performance.now() - startTime);
      return {
        text: localTranscript,
        source: 'local',
        confidence: localConfidence,
        cloudLatency,
        cloudCost: 0,
      };
    }
  }

  /**
   * 仅使用云端 Whisper 进行识别（跳过本地）
   *
   * 适用于浏览器不支持 Web Speech API 的场景。
   *
   * @param audioBlob - 音频数据
   * @returns 识别结果
   */
  async recognizeCloudOnly(audioBlob: Blob): Promise<SpeechRecognitionResult> {
    const startTime = performance.now();

    try {
      const result = await transcribeWithWhisper(
        audioBlob,
        this.fallbackConfig.whisperConfig,
      );

      const cloudLatency = Math.round(performance.now() - startTime);
      const cloudCost =
        Math.round(
          ((audioBlob.size / 1024 / 10) * 0.006 + Number.EPSILON) * 10000,
        ) / 10000;

      return {
        text: result.text,
        source: 'cloud',
        confidence: 0.95,
        cloudLatency,
        cloudCost,
      };
    } catch {
      return {
        text: '',
        source: 'cloud',
        confidence: 0,
        cloudLatency: Math.round(performance.now() - startTime),
        cloudCost: 0,
      };
    }
  }
}

/**
 * 预估 Whisper API 调用费用
 *
 * Whisper 定价：$0.006 / 分钟（四舍五入到秒）
 *
 * @param durationSeconds - 音频时长（秒）
 * @returns 预估费用（美元）
 */
export function estimateWhisperCost(durationSeconds: number): number {
  const minutes = Math.ceil(durationSeconds) / 60;
  return Math.round(minutes * 0.006 * 10000) / 10000;
}
