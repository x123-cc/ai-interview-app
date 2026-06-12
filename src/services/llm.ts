import type {
  LLMConfig,
  LLMClient,
  LLMResult,
  LLMTextMessage,
} from '@/types';

/**
 * 创建 LLM 客户端
 *
 * 封装 OpenAI / Anthropic 兼容的 Chat Completions API，
 * 提供纯文本和多模态（文本+图片）两种调用方式。
 *
 * 支持任意兼容 OpenAI API 格式的服务（OpenAI、Claude API、本地 vLLM 等）。
 *
 * @param config - API 配置（apiKey、baseUrl、model 等）
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
   * 发送纯文本对话请求
   */
  async function chat(messages: LLMTextMessage[]): Promise<LLMResult> {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        temperature,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(
        `LLM API 错误（${response.status}）：${errorBody || response.statusText}`,
      );
    }

    const data = await response.json();
    return {
      content: data.choices?.[0]?.message?.content ?? '',
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
      model: data.model ?? model,
    };
  }

  /**
   * 构建多模态消息（文本 + 单张图片）
   */
  function buildMultimodalMessage(
    messages: LLMTextMessage[],
    imageBase64: string,
  ) {
    // 最后一条用户消息附加图片
    const lastMsg = messages[messages.length - 1];
    const userText = lastMsg?.role === 'user' ? lastMsg.content : '';

    const systemMsgs = messages
      .filter((m) => m.role !== 'user' || m !== lastMsg)
      .map((m) => ({ role: m.role, content: m.content }));

    const userContent: { type: 'text'; text: string }[] = [];
    if (userText) {
      userContent.push({ type: 'text', text: userText });
    }

    return [
      ...systemMsgs,
      {
        role: 'user' as const,
        content: [
          ...userContent,
          {
            type: 'image_url' as const,
            image_url: { url: imageBase64, detail: 'auto' as const },
          },
        ],
      },
    ];
  }

  /**
   * 发送多模态对话（文本 + 图片）
   */
  async function chatWithImage(
    messages: LLMTextMessage[],
    imageBase64: string,
  ): Promise<LLMResult> {
    const multimodalMessages = buildMultimodalMessage(
      messages,
      imageBase64,
    );

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: multimodalMessages,
        max_tokens: maxTokens,
        temperature,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(
        `LLM API 错误（${response.status}）：${errorBody || response.statusText}`,
      );
    }

    const data = await response.json();
    return {
      content: data.choices?.[0]?.message?.content ?? '',
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
      model: data.model ?? model,
    };
  }

  return { chat, chatWithImage };
}
