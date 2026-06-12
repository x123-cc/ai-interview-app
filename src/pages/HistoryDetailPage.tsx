import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { HistoryRecord, ModelAnswer } from '@/types';

function loadRecord(id: string): HistoryRecord | null {
  try {
    const raw = localStorage.getItem('ai_interview_history');
    if (!raw) return null;
    const history: HistoryRecord[] = JSON.parse(raw);
    return history.find((r) => r.id === id) ?? null;
  } catch {
    return null;
  }
}

export default function HistoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [record, setRecord] = useState<HistoryRecord | null>(null);
  const [generating, setGenerating] = useState(false);
  const [modelAnswers, setModelAnswers] = useState<ModelAnswer[]>([]);
  const [genError, setGenError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const r = loadRecord(id);
    setRecord(r);
    if (r?.modelAnswers) {
      setModelAnswers(r.modelAnswers);
    }
  }, [id]);

  // ── AI 生成模拟回答 ──
  const generateModelAnswers = useCallback(async () => {
    if (!record) return;

    const apiKey = localStorage.getItem('ai_interview_api_key') || '';
    if (!apiKey) {
      setGenError('请先在设置页面配置 API Key');
      return;
    }

    setGenerating(true);
    setGenError(null);

    try {
      const provider = localStorage.getItem('ai_interview_provider') || 'openai';
      const baseUrl =
        provider === 'anthropic'
          ? 'https://api.anthropic.com/v1'
          : provider === 'custom'
            ? localStorage.getItem('ai_interview_base_url') || ''
            : '';

      const { createLLMClient } = await import('@/services/llm');
      const llm = createLLMClient({ apiKey, baseUrl });

      // 提取面试官问题
      const questions = record.transcript
        .filter((m) => m.role === 'interviewer')
        .map((m) => m.text);

      if (questions.length === 0) {
        setGenError('未找到面试问题');
        setGenerating(false);
        return;
      }

      const resume = record.resume || '';
      const resumeContext = resume
        ? `\n## 候选人简历\n${resume.slice(0, 2000)}`
        : '';

      const prompt = `你是一位资深的面试辅导专家。请根据以下面试问题，结合候选人简历，为每个问题生成一个高质量的模拟回答。

## 要求
1. 回答应体现候选人的真实经历（如有简历信息）
2. 使用 STAR 法则组织回答（情境-任务-行动-结果）
3. 语言专业、简洁、有说服力
4. 每个回答控制在 200 字以内
5. 输出纯 JSON 格式：{"answers":[{"question":"问题文本","answer":"模拟回答"}]}
${resumeContext}
## 面试问题
${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`;

      const result = await llm.chat([{ role: 'user', content: prompt }]);

      // 解析 JSON
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed.answers)) {
          const answers: ModelAnswer[] = parsed.answers.filter(
            (a: unknown): a is ModelAnswer =>
              typeof a === 'object' &&
              a != null &&
              'question' in a &&
              'answer' in a,
          );
          setModelAnswers(answers);

          // 保存到 localStorage
          const raw = localStorage.getItem('ai_interview_history');
          if (raw) {
            const history: HistoryRecord[] = JSON.parse(raw);
            const idx = history.findIndex((r) => r.id === record.id);
            if (idx >= 0) {
              history[idx].modelAnswers = answers;
              localStorage.setItem('ai_interview_history', JSON.stringify(history));
            }
          }
        }
      }
    } catch (err) {
      console.error('生成模拟回答失败:', err);
      setGenError('生成失败，请检查网络和 API Key 设置');
    } finally {
      setGenerating(false);
    }
  }, [record]);

  if (!record) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-[#86868b]">记录未找到</p>
        <button onClick={() => navigate('/history')} className="apple-btn-secondary mt-4">
          返回历史记录
        </button>
      </div>
    );
  }

  const date = new Date(record.date);
  const dateStr = date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const timeStr = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  const durationMin = Math.floor(record.duration / 60);
  const durationSec = record.duration % 60;

  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <button onClick={() => navigate('/history')} className="mb-6 text-[0.8125rem] text-[#86868b] hover:text-[#1d1d1f] transition-colors">
        ← 返回历史记录
      </button>

      {/* 标题与元数据 */}
      <div className="mb-10">
        <h1 className="text-[2rem] font-bold tracking-[-0.022em] text-[#1d1d1f]">
          {record.title || '未命名面试'}
        </h1>
        <div className="mt-2 flex flex-wrap gap-3 text-[0.8125rem] text-[#86868b]">
          <span>{dateStr} {timeStr}</span>
          <span>·</span>
          <span>时长 {durationMin} 分 {durationSec} 秒</span>
          <span>·</span>
          <span>{record.transcript.length} 条对话</span>
          <span className="rounded-full bg-[#e8e8ed] px-2 py-0.5 text-[0.6875rem] text-[#1d1d1f]">
            {record.mode === 'review' ? '复盘' : '面试'}
          </span>
          {record.score != null && (
            <span className="font-medium text-[#0071e3]">评分 {record.score}/10</span>
          )}
        </div>
      </div>

      {/* 逐字稿 */}
      <div className="mb-10">
        <h2 className="mb-4 text-[1.125rem] font-semibold tracking-tight text-[#1d1d1f]">面试逐字稿</h2>
        <div className="apple-card space-y-3 p-5">
          {record.transcript.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                  msg.role === 'user'
                    ? 'bg-[#0071e3] text-white'
                    : 'bg-[#f5f5f7] text-[#1d1d1f]'
                }`}
              >
                <div className="mb-1 text-[0.6875rem] opacity-50">
                  {msg.role === 'interviewer' ? '面试官' : '候选人'}
                </div>
                <p className="text-[0.875rem] leading-relaxed whitespace-pre-wrap">{msg.text}</p>
              </div>
            </div>
          ))}
          {record.transcript.length === 0 && (
            <p className="text-center text-[0.875rem] text-[#aeaeb2]">暂无对话记录</p>
          )}
        </div>
      </div>

      {/* AI 模拟回答 */}
      <div className="mb-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[1.125rem] font-semibold tracking-tight text-[#1d1d1f]">
            AI 模拟回答
            {record.resume && <span className="ml-2 text-[0.8125rem] font-normal text-[#aeaeb2]">基于个人简历生成</span>}
          </h2>
          {modelAnswers.length === 0 && !generating && (
            <button onClick={generateModelAnswers} className="apple-btn-primary">
              生成模拟回答
            </button>
          )}
        </div>

        {genError && (
          <div className="apple-card mb-4 border-[#ff3b30]/20 bg-[#ff3b30]/5 p-3 text-[0.8125rem] text-[#ff3b30]">
            {genError}
          </div>
        )}

        {generating && (
          <div className="apple-card flex items-center justify-center gap-3 p-8 text-[0.875rem] text-[#86868b]">
            <svg className="h-5 w-5 animate-spin text-[#0071e3]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            AI 正在基于简历生成高质量模拟回答...
          </div>
        )}

        {modelAnswers.length > 0 && (
          <div className="space-y-4">
            {modelAnswers.map((ma, i) => (
              <div key={i} className="apple-card border-[#0071e3]/10 bg-[#0071e3]/3 p-5">
                <div className="mb-2 text-[0.8125rem] font-semibold tracking-tight text-[#0071e3]">
                  Q{i + 1}: {ma.question}
                </div>
                <div className="rounded-xl bg-white p-4 text-[0.875rem] leading-relaxed text-[#1d1d1f]">
                  {ma.answer}
                </div>
              </div>
            ))}
            <button onClick={generateModelAnswers} className="text-[0.8125rem] text-[#0071e3] hover:underline">
              重新生成
            </button>
          </div>
        )}
      </div>

      {/* 原始信息 */}
      {record.resume && (
        <details className="apple-card mb-4 p-5">
          <summary className="cursor-pointer text-[0.8125rem] font-medium tracking-tight text-[#1d1d1f]">简历原文</summary>
          <pre className="mt-3 max-h-48 overflow-y-auto whitespace-pre-wrap text-[0.75rem] text-[#86868b]">{record.resume}</pre>
        </details>
      )}
      {record.jd && (
        <details className="apple-card mb-4 p-5">
          <summary className="cursor-pointer text-[0.8125rem] font-medium tracking-tight text-[#1d1d1f]">岗位 JD</summary>
          <pre className="mt-3 max-h-48 overflow-y-auto whitespace-pre-wrap text-[0.75rem] text-[#86868b]">{record.jd}</pre>
        </details>
      )}
    </div>
  );
}
