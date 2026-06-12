import { useState } from 'react';
import { getBrowserCapabilities } from '@/utils/browser';

export default function SettingsPage() {
  const [apiKey, setApiKey] = useState(
    () => localStorage.getItem('ai_interview_api_key') || '',
  );
  const [provider, setProvider] = useState(
    () => localStorage.getItem('ai_interview_provider') || 'openai',
  );
  const [saved, setSaved] = useState(false);

  const caps = getBrowserCapabilities();

  const handleSave = () => {
    localStorage.setItem('ai_interview_api_key', apiKey);
    localStorage.setItem('ai_interview_provider', provider);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-semibold text-gray-900">设置</h1>

      {/* API Key */}
      <div className="mt-8 rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-medium text-gray-800">API 配置</h2>
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700">
            LLM 服务商
          </label>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic (Claude)</option>
            <option value="custom">自定义端点</option>
          </select>
        </div>
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700">
            API Key
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <button
          onClick={handleSave}
          className="mt-4 rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {saved ? '已保存 ✓' : '保存'}
        </button>
      </div>

      {/* 浏览器兼容性 */}
      <div className="mt-8 rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-medium text-gray-800">浏览器兼容性</h2>
        <div className="mt-4 space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span
              className={`inline-block h-2 w-2 rounded-full ${caps.speechRecognition ? 'bg-green-500' : 'bg-red-500'}`}
            />
            <span>语音识别：{caps.speechRecognition ? '支持' : '不支持'}</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-block h-2 w-2 rounded-full ${caps.speechSynthesis ? 'bg-green-500' : 'bg-red-500'}`}
            />
            <span>语音合成：{caps.speechSynthesis ? '支持' : '不支持'}</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-block h-2 w-2 rounded-full ${caps.mediaDevices ? 'bg-green-500' : 'bg-red-500'}`}
            />
            <span>摄像头/麦克风：{caps.mediaDevices ? '支持' : '不支持'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
