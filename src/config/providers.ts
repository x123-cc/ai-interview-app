/** LLM 服务商类型 */
export type LLMProvider = 'openai' | 'anthropic' | 'qwen' | 'glm' | 'hunyuan' | 'custom';

/** 服务商配置 */
export interface ProviderConfig {
  id: LLMProvider;
  label: string;
  /** API 基础 URL */
  baseUrl: string;
  /** 默认模型 */
  defaultModel: string;
  /** 是否需要 OpenAI 兼容格式 */
  openaiCompatible: boolean;
  /** 是否需要 x-api-key header (而非 Bearer) */
  useXApiKey: boolean;
}

/** 所有服务商配置 */
export const PROVIDERS: Record<LLMProvider, ProviderConfig> = {
  openai: {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
    openaiCompatible: true,
    useXApiKey: false,
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-4-6',
    openaiCompatible: false,
    useXApiKey: true,
  },
  qwen: {
    id: 'qwen',
    label: '通义千问 (阿里)',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-plus',
    openaiCompatible: true,
    useXApiKey: false,
  },
  glm: {
    id: 'glm',
    label: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4-flash',
    openaiCompatible: true,
    useXApiKey: false,
  },
  hunyuan: {
    id: 'hunyuan',
    label: '腾讯混元',
    baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1',
    defaultModel: 'hunyuan-lite',
    openaiCompatible: true,
    useXApiKey: false,
  },
  custom: {
    id: 'custom',
    label: '自定义端点',
    baseUrl: '',
    defaultModel: 'gpt-4o',
    openaiCompatible: true,
    useXApiKey: false,
  },
};

/**
 * 根据 localStorage 中保存的 provider 获取配置
 */
export function getProviderConfig(): ProviderConfig {
  const provider = (localStorage.getItem('ai_interview_provider') || 'openai') as LLMProvider;
  const config = PROVIDERS[provider] || PROVIDERS.openai;

  // 自定义端点从 localStorage 读取 URL
  if (provider === 'custom') {
    return {
      ...config,
      baseUrl: localStorage.getItem('ai_interview_base_url') || '',
    };
  }

  return config;
}

/**
 * 根据 API Key 前缀推断可能的服务商（辅助检测）
 */
export function detectProviderByKey(apiKey: string): LLMProvider | null {
  if (!apiKey) return null;
  if (apiKey.startsWith('sk-ant-')) return 'anthropic';
  // OpenAI 和国内厂商 Key 都以 sk- 开头，无法精确区分
  if (apiKey.startsWith('sk-')) return null; // 可能是 openai/qwen/glm/hunyuan
  return null;
}

/** 可选项列表（用于 UI 渲染） */
export const PROVIDER_OPTIONS: { value: LLMProvider; label: string }[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic (Claude)' },
  { value: 'qwen', label: '通义千问 (阿里)' },
  { value: 'glm', label: '智谱 GLM' },
  { value: 'hunyuan', label: '腾讯混元' },
  { value: 'custom', label: '自定义端点' },
];
