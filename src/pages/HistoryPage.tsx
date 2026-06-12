import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { HistoryRecord } from '@/types';
import TrendChart from '@/components/history/TrendChart';
import {
  calculateTrend,
  findWeakestDimension,
  generateSuggestions,
} from '@/utils/analytics';

function loadHistory(): HistoryRecord[] {
  try {
    const raw = localStorage.getItem('ai_interview_history');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export default function HistoryPage() {
  const navigate = useNavigate();
  const [entries] = useState<HistoryRecord[]>(loadHistory);

  if (entries.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-[2rem] font-bold tracking-[-0.022em] text-[#1d1d1f]">历史记录</h1>
        <p className="mt-8 text-[#86868b]">
          还没有面试记录，开始你的第一次模拟面试吧。
        </p>
      </div>
    );
  }

  const scores = entries
    .filter((e) => e.score != null)
    .map((e) => e.score!);
  const trend = scores.length >= 2 ? calculateTrend(scores) : null;
  const avgScore =
    scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const weakest = findWeakestDimension({});
  const suggestions = generateSuggestions(weakest, avgScore);

  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-[2rem] font-bold tracking-[-0.022em] text-[#1d1d1f]">历史记录</h1>

      {/* 趋势分析 */}
      {entries.length >= 2 && trend && (
        <div className="apple-card mt-6 p-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[0.875rem] font-semibold tracking-tight text-[#1d1d1f]">评分趋势</h2>
            <span
              className={`text-[0.8125rem] font-medium ${
                trend.direction === 'rising'
                  ? 'text-[#34c759]'
                  : trend.direction === 'falling'
                    ? 'text-[#ff3b30]'
                    : 'text-[#86868b]'
              }`}
            >
              {trend.label} {trend.direction === 'rising' ? '↑' : trend.direction === 'falling' ? '↓' : '→'}
            </span>
          </div>
          <TrendChart scores={scores} />
          <div className="mt-2 flex gap-4 text-[0.75rem] text-[#86868b]">
            <span>平均分：{avgScore.toFixed(1)}/10</span>
            <span>总次数：{entries.length}</span>
          </div>
        </div>
      )}

      {/* 改进建议 */}
      {suggestions.length > 0 && (
        <div className="apple-card mt-4 border-[#ff9500]/20 bg-[#ff9500]/5 p-5">
          <h3 className="text-[0.875rem] font-semibold tracking-tight text-[#1d1d1f]">改进建议</h3>
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[0.8125rem] text-[#1d1d1f]/70">
            {suggestions.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 记录列表 */}
      <div className="mt-6 space-y-3">
        {entries.map((entry) => {
          const date = new Date(entry.date);
          const dateStr = date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
          const timeStr = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
          const durationMin = Math.floor(entry.duration / 60);
          const durationSec = entry.duration % 60;
          const msgCount = entry.transcript?.length ?? 0;

          return (
            <button
              key={entry.id}
              onClick={() => navigate(`/history/${entry.id}`)}
              className="apple-card apple-card-hover w-full p-5 text-left"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-[0.9375rem] font-semibold tracking-tight text-[#1d1d1f]">
                    {entry.title || '未命名面试'}
                  </h3>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[0.75rem] text-[#86868b]">
                    <span>{dateStr} {timeStr}</span>
                    <span>·</span>
                    <span>时长 {durationMin} 分 {durationSec} 秒</span>
                    <span>·</span>
                    <span>{msgCount} 条对话</span>
                    <span className="rounded-full bg-[#e8e8ed] px-2 py-0.5 text-[0.6875rem] text-[#1d1d1f]">
                      {entry.mode === 'review' ? '复盘' : '面试'}
                    </span>
                    {entry.score != null && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-medium ${
                          entry.score >= 7
                            ? 'bg-[#34c759]/10 text-[#34c759]'
                            : entry.score >= 4
                              ? 'bg-[#ff9500]/10 text-[#ff9500]'
                              : 'bg-[#ff3b30]/10 text-[#ff3b30]'
                        }`}
                      >
                        {entry.score}/10
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-lg text-[#aeaeb2]">→</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
