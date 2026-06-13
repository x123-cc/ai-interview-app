import { useState } from 'react';
import { getBrowserCapabilities } from '@/utils/browser';
import { PROVIDERS, PROVIDER_OPTIONS, detectProviderByKey, type LLMProvider } from '@/config/providers';

function getDefaultModelForProvider(provider: LLMProvider): string {
  return PROVIDERS[provider]?.defaultModel ?? 'gpt-4o';
}

export default function SettingsPage() {
  const [apiKey, setApiKey] = useState(
    () => localStorage.getItem('ai_interview_api_key') || '',
  );
  const [provider, setProvider] = useState<LLMProvider>(
    () => (localStorage.getItem('ai_interview_provider') || 'openai') as LLMProvider,
  );
  const [customBaseUrl, setCustomBaseUrl] = useState(
    () => localStorage.getItem('ai_interview_base_url') || '',
  );
  const [model, setModel] = useState(
    () => localStorage.getItem('ai_interview_model') || '',
  );
  const [autoSave, setAutoSave] = useState(
    () => localStorage.getItem('ai_interview_auto_save') === 'true',
  );
  const [saved, setSaved] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<'idle' | 'success' | 'error'>('idle');
  const [verifyMsg, setVerifyMsg] = useState('');

  const caps = getBrowserCapabilities();

  const handleSave = () => {
    localStorage.setItem('ai_interview_api_key', apiKey);
    localStorage.setItem('ai_interview_provider', provider);
    localStorage.setItem('ai_interview_model', model);
    if (provider === 'custom') {
      localStorage.setItem('ai_interview_base_url', customBaseUrl);
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleVerify = async () => {
    if (!apiKey.trim()) {
      setVerifyResult('error');
      setVerifyMsg('请先输入 API Key');
      return;
    }

    setVerifying(true);
    setVerifyResult('idle');
    setVerifyMsg('');

    try {
      const { getProviderConfig } = await import('@/config/providers');
      // 临时设置 provider 以获取正确配置
      const prevProvider = localStorage.getItem('ai_interview_provider');
      localStorage.setItem('ai_interview_provider', provider);
      if (provider === 'custom') {
        localStorage.setItem('ai_interview_base_url', customBaseUrl);
      }
      const cfg = getProviderConfig();
      // 恢复
      if (prevProvider) localStorage.setItem('ai_interview_provider', prevProvider);

      const baseUrl = cfg.baseUrl || customBaseUrl || 'https://api.openai.com/v1';

      if (!cfg.openaiCompatible) {
        // Anthropic: 用 models list 验证
        const resp = await fetch('https://api.anthropic.com/v1/models?limit=1', {
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
        });
        if (resp.ok) {
          setVerifyResult('success');
          setVerifyMsg('Anthropic API 连接正常');
        } else if (resp.status === 401 || resp.status === 403) {
          setVerifyResult('error');
          setVerifyMsg('API Key 无效');
        } else {
          setVerifyResult('error');
          setVerifyMsg(`连接失败 (HTTP ${resp.status})`);
        }
      } else {
        // OpenAI 兼容: 发送一条简短测试消息
        const testModel = model || cfg.defaultModel;
        const resp = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: testModel,
            messages: [{ role: 'user', content: 'hi' }],
            max_tokens: 5,
          }),
        });

        if (resp.ok) {
          const data = await resp.json();
          const returnedModel = data.model || testModel;
          setVerifyResult('success');
          setVerifyMsg(`连接成功，模型: ${returnedModel}`);
        } else if (resp.status === 401 || resp.status === 403) {
          setVerifyResult('error');
          setVerifyMsg('API Key 无效或被拒绝');
        } else if (resp.status === 404) {
          setVerifyResult('error');
          setVerifyMsg('端点不存在，请检查服务商选择');
        } else {
          const errData = await resp.json().catch(() => ({}));
          setVerifyResult('error');
          setVerifyMsg((errData as { error?: { message?: string } })?.error?.message || `请求失败 (HTTP ${resp.status})`);
        }
      }
    } catch (err) {
      setVerifyResult('error');
      setVerifyMsg(err instanceof TypeError ? '网络连接失败，请检查端点地址' : '验证请求失败');
    } finally {
      setVerifying(false);
    }
  };

  // Key 前缀提示
  const detectedProvider = detectProviderByKey(apiKey);

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-[2rem] font-bold tracking-[-0.022em] text-[#1d1d1f]">设置</h1>

      {/* API 配置 */}
      <div className="apple-card mt-8 p-6">
        <h2 className="text-[1rem] font-semibold tracking-tight text-[#1d1d1f]">API 配置</h2>
        <div className="mt-5">
          <label className="text-[0.8125rem] font-medium tracking-tight text-[#1d1d1f]">
            LLM 服务商
          </label>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as LLMProvider)}
            className="apple-input mt-1.5 w-full"
          >
            {PROVIDER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        {/* 模型名称 */}
        <div className="mt-4">
          <label className="text-[0.8125rem] font-medium tracking-tight text-[#1d1d1f]">
            模型名称
          </label>
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={`默认: ${getDefaultModelForProvider(provider)}`}
            className="apple-input mt-1.5 w-full"
          />
          <p className="mt-1 text-[0.6875rem] text-[#86868b]">
            留空使用默认模型。如阿里 qwen3.5-omni-plus 请填写完整模型名
          </p>
        </div>
        {/* 自定义端点 URL */}
        {provider === 'custom' && (
          <div className="mt-4">
            <label className="text-[0.8125rem] font-medium tracking-tight text-[#1d1d1f]">
              自定义端点 URL
            </label>
            <input
              type="text"
              value={customBaseUrl}
              onChange={(e) => setCustomBaseUrl(e.target.value)}
              placeholder="https://your-api.com/v1"
              className="apple-input mt-1.5 w-full"
            />
          </div>
        )}
        <div className="mt-4">
          <label className="text-[0.8125rem] font-medium tracking-tight text-[#1d1d1f]">
            API Key
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
            className="apple-input mt-1.5 w-full"
          />
          {detectedProvider && detectedProvider !== provider && (
            <p className="mt-1.5 text-[0.75rem] text-[#ff9500]">
              Key 前缀匹配到 {detectedProvider}，当前选择的是 {provider}，可能不兼容
            </p>
          )}
        </div>
        <div className="mt-5 flex items-center gap-3">
          <button onClick={handleSave} className="apple-btn-primary">
            {saved ? '已保存 ✓' : '保存'}
          </button>
          <button
            onClick={handleVerify}
            disabled={verifying || !apiKey.trim()}
            className="apple-btn-secondary disabled:opacity-50"
          >
            {verifying ? (
              <span className="flex items-center gap-1.5">
                <svg className="h-3.5 w-3.5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                验证中
              </span>
            ) : (
              '验证'
            )}
          </button>
        </div>
        {/* 验证结果 */}
        {verifyResult !== 'idle' && (
          <div
            className={`mt-3 rounded-xl px-4 py-2.5 text-[0.8125rem] font-medium ${
              verifyResult === 'success'
                ? 'bg-[#34c759]/10 text-[#34c759]'
                : 'bg-[#ff3b30]/10 text-[#ff3b30]'
            }`}
          >
            {verifyResult === 'success' ? '✓' : '✗'} {verifyMsg}
          </div>
        )}
      </div>

      {/* 面试设置 */}
      <div className="apple-card mt-6 p-6">
        <h2 className="text-[1rem] font-semibold tracking-tight text-[#1d1d1f]">面试设置</h2>
        <div className="mt-5 flex items-center justify-between">
          <div>
            <span className="text-[0.8125rem] font-medium text-[#1d1d1f]">自动保存</span>
            <p className="mt-0.5 text-[0.75rem] text-[#86868b]">面试中每 30 秒自动保存进度，默认关闭</p>
          </div>
          <button
            onClick={() => {
              const current = localStorage.getItem('ai_interview_auto_save') === 'true';
              localStorage.setItem('ai_interview_auto_save', String(!current));
              setAutoSave(!current);
            }}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
              autoSave ? 'bg-[#0071e3]' : 'bg-[#d2d2d7]'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
                autoSave ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* 浏览器兼容性 */}
      <div className="apple-card mt-6 p-6">
        <h2 className="text-[1rem] font-semibold tracking-tight text-[#1d1d1f]">浏览器兼容性</h2>
        <div className="mt-5 space-y-3">
          {[
            { key: 'speechRecognition', label: '语音识别' },
            { key: 'speechSynthesis', label: '语音合成' },
            { key: 'mediaDevices', label: '摄像头/麦克风' },
          ].map(({ key, label }) => {
            const supported = caps[key as keyof typeof caps];
            return (
              <div key={key} className="flex items-center gap-3">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    supported ? 'bg-[#34c759]' : 'bg-[#ff3b30]'
                  }`}
                />
                <span className="text-[0.8125rem] text-[#1d1d1f]">
                  {label}：{supported ? '支持' : '不支持'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
