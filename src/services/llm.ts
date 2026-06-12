import type {
  LLMConfig,
  LLMClient,
  LLMResult,
  LLMTextMessage,
  LLMCallOptions,
} from '@/types';

/** 最大重试次数 */
const MAX_RETRIES = 3;

/**
 * 指数退避延迟计算（1s / 2s / 4s，上限 16s）
 */
function getRetryDelay(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt), 16000);
}

/**
 * 创建 LLM 客户端
 *
 * 封装 OpenAI 兼容的 Chat Completions API，
 * 提供纯文本和多模态（文本+图片）两种调用方式，
 * 内置错误重试、请求中断和 token 用量统计。
 *
 * @param config - API 配置
 * @returns LLM 客户端实例
 */
export function createLLMClient(config: LLMConfig): LLMClient {
  const {
    apiKey,
    baseUrl = 'https://api.openai.com/v1',
    model = 'gpt-4o',
    maxTokens = 1024,
    temperature = 0.7,
  } = config;

  /**
   * 发送 Chat Completions 请求（带重试和中断支持）
   */
  async function makeRequest(
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<LLMResult> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      // 检查是否已被中断
      if (signal?.aborted) {
        throw new DOMException('请求已被取消', 'AbortError');
      }

      try {
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
          signal,
        });

        // 401 不重试
        if (response.status === 401) {
          const errorBody = await response.text().catch(() => '');
          throw new Error(`API Key 无效：${errorBody}`);
        }

        // 429 可重试
        if (response.status === 429) {
          if (attempt === MAX_RETRIES) {
            throw new Error('API 请求过于频繁，请稍后重试');
          }
          await sleep(getRetryDelay(attempt));
          continue;
        }

        // 5xx 可重试
        if (response.status >= 500) {
          if (attempt === MAX_RETRIES) {
            throw new Error(`API 服务异常（${response.status}）`);
          }
          await sleep(getRetryDelay(attempt));
          continue;
        }

        // 其他错误
        if (!response.ok) {
          const errorBody = await response.text().catch(() => '');
          throw new Error(
            `API 错误（${response.status}）：${errorBody || response.statusText}`,
          );
        }

        // 成功
        const data = await response.json();
        return {
          content: data.choices?.[0]?.message?.content ?? '',
          inputTokens: data.usage?.prompt_tokens ?? 0,
          outputTokens: data.usage?.completion_tokens ?? 0,
          model: data.model ?? model,
        };
      } catch (err) {
        // AbortError 直接抛出不重试
        if (err instanceof DOMException && err.name === 'AbortError') {
          throw err;
        }

        lastError = err instanceof Error ? err : new Error(String(err));

        // 网络错误可重试
        if (attempt < MAX_RETRIES) {
          await sleep(getRetryDelay(attempt));
          continue;
        }
      }
    }

    throw lastError ?? new Error('LLM API 调用失败');
  }

  /**
   * 发送纯文本对话
   */
  async function chat(
    messages: LLMTextMessage[],
    options?: LLMCallOptions,
  ): Promise<LLMResult> {
    return makeRequest(
      {
        model,
        messages,
        max_tokens: maxTokens,
        temperature,
      },
      options?.signal,
    );
  }

  /**
   * 发送多模态对话（文本 + 图片）
   */
  async function chatWithImage(
    messages: LLMTextMessage[],
    imageBase64: string,
    options?: LLMCallOptions,
  ): Promise<LLMResult> {
    const lastMsg = messages[messages.length - 1];
    const userText = lastMsg?.role === 'user' ? lastMsg.content : '';

    const systemMsgs = messages
      .filter((m) => m.role !== 'user' || m !== lastMsg)
      .map((m) => ({ role: m.role, content: m.content }));

    const userContent: { type: 'text'; text: string }[] = [];
    if (userText) {
      userContent.push({ type: 'text', text: userText });
    }

    const detail = options?.imageDetail ?? 'auto';

    const multimodalMessages = [
      ...systemMsgs,
      {
        role: 'user',
        content: [
          ...userContent,
          {
            type: 'image_url',
            image_url: { url: imageBase64, detail },
          },
        ],
      },
    ];

    return makeRequest(
      {
        model,
        messages: multimodalMessages,
        max_tokens: maxTokens,
        temperature,
      },
      options?.signal,
    );
  }

  return { chat, chatWithImage };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
