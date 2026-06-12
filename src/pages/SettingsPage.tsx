import { useState } from 'react';
import { getBrowserCapabilities } from '@/utils/browser';
import { PROVIDER_OPTIONS, detectProviderByKey, type LLMProvider } from '@/config/providers';

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
  const [autoSave, setAutoSave] = useState(
    () => localStorage.getItem('ai_interview_auto_save') === 'true',
  );
  const [saved, setSaved] = useState(false);

  const caps = getBrowserCapabilities();

  const handleSave = () => {
    localStorage.setItem('ai_interview_api_key', apiKey);
    localStorage.setItem('ai_interview_provider', provider);
    if (provider === 'custom') {
      localStorage.setItem('ai_interview_base_url', customBaseUrl);
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
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
        <button onClick={handleSave} className="apple-btn-primary mt-5">
          {saved ? '已保存 ✓' : '保存'}
        </button>
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
