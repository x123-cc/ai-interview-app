/** Whisper API 转录结果 */
export interface WhisperResult {
  /** 识别文本 */
  text: string;
}

/** Whisper API 配置 */
export interface WhisperConfig {
  /** OpenAI API Key */
  apiKey: string;
  /** API 基础 URL，默认 OpenAI 官方端点 */
  baseUrl?: string;
  /** 模型名称，默认 'whisper-1' */
  model?: string;
  /** 提示文本，用于引导识别风格 */
  prompt?: string;
  /** 语言代码（ISO 639-1），不传则自动检测 */
  language?: string;
}

/**
 * 指数退避延迟计算
 */
function getRetryDelay(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt), 16000);
}

/**
 * 调用 OpenAI Whisper API 进行云端语音转文本
 *
 * 将音频 Blob 上传到 Whisper 端点进行高精度识别，
 * 作为本地 Web Speech API 识别质量不足时的兜底方案。
 *
 * 错误处理策略：
 * - 401：API Key 无效 → 立即抛出，不重试
 * - 429：速率限制 → 指数退避重试（最多 3 次）
 * - 5xx：服务端错误 → 指数退避重试（最多 3 次）
 * - 网络错误 → 重试（最多 3 次）
 *
 * @param audioBlob - 要转录的音频数据（支持 wav/mp3/webm 等格式）
 * @param config - API 配置
 * @returns 转录结果，包含识别文本
 * @throws AuthError — API Key 无效
 * @throws RateLimitError — 重试耗尽后仍被限流
 * @throws ServerError — 服务端持续错误
 * @throws NetworkError — 网络持续不可用
 */
export async function transcribeWithWhisper(
  audioBlob: Blob,
  config: WhisperConfig,
): Promise<WhisperResult> {
  const {
    apiKey,
    baseUrl = 'https://api.openai.com/v1',
    model = 'whisper-1',
    prompt,
    language,
  } = config;

  // 构建 FormData
  const formData = new FormData();
  formData.append('file', audioBlob, 'recording.wav');
  formData.append('model', model);
  if (prompt) formData.append('prompt', prompt);
  if (language) formData.append('language', language);

  const maxRetries = 3;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(`${baseUrl}/audio/transcriptions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: formData,
      });

      // 成功
      if (response.ok) {
        return (await response.json()) as WhisperResult;
      }

      // API Key 无效，不重试
      if (response.status === 401) {
        throw new AuthError('API Key 无效，请检查设置中的 Key 是否正确');
      }

      // 速率限制，可重试
      if (response.status === 429) {
        if (attempt === maxRetries) {
          throw new RateLimitError('Whisper API 请求过于频繁，请稍后重试');
        }
        await sleep(getRetryDelay(attempt));
        continue;
      }

      // 服务端错误，可重试
      if (response.status >= 500) {
        if (attempt === maxRetries) {
          throw new ServerError(
            `Whisper API 服务异常（${response.status}），请稍后重试`,
          );
        }
        await sleep(getRetryDelay(attempt));
        continue;
      }

      // 其他错误
      throw new Error(`Whisper API 返回未知错误（${response.status}）`);
    } catch (err) {
      // 网络错误，可重试
      if (err instanceof TypeError && attempt < maxRetries) {
        await sleep(getRetryDelay(attempt));
        continue;
      }
      // 已经是自定义错误，直接抛出
      if (
        err instanceof AuthError ||
        err instanceof RateLimitError ||
        err instanceof ServerError
      ) {
        throw err;
      }
      if (attempt === maxRetries) {
        throw new NetworkError('无法连接到 Whisper API，请检查网络连接');
      }
      await sleep(getRetryDelay(attempt));
    }
  }

  // 不应到达此处
  throw new Error('Whisper API 调用失败：已达最大重试次数');
}

/** 延时工具 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 自定义错误类 */
export class AuthError extends Error {
  name = 'AuthError';
}

export class RateLimitError extends Error {
  name = 'RateLimitError';
}

export class ServerError extends Error {
  name = 'ServerError';
}

export class NetworkError extends Error {
  name = 'NetworkError';
}
