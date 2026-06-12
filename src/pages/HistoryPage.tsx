import { useState, useEffect } from 'react';
import { INTERVIEW_TYPE_LABELS } from '@/config/prompts';

interface HistoryEntry {
  id: string;
  date: string;
  type: string;
  score: number;
  duration: number;
  preview: string;
}

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem('ai_interview_history');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export default function HistoryPage() {
  const [entries] = useState<HistoryEntry[]>(loadHistory);

  if (entries.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 text-center">
        <h1 className="text-2xl font-semibold text-gray-900">历史记录</h1>
        <p className="mt-8 text-gray-500">还没有面试记录，开始你的第一次模拟面试吧。</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-semibold text-gray-900">历史记录</h1>
      <div className="mt-6 space-y-4">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="rounded-lg border border-gray-200 p-4 transition-colors hover:border-gray-300"
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm text-gray-500">{entry.date}</span>
                <span className="ml-3 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                  {INTERVIEW_TYPE_LABELS[entry.type as keyof typeof INTERVIEW_TYPE_LABELS] ?? entry.type}
                </span>
              </div>
              <div className="text-right">
                <span
                  className={`text-2xl font-bold ${
                    entry.score >= 7
                      ? 'text-green-600'
                      : entry.score >= 4
                        ? 'text-yellow-600'
                        : 'text-red-600'
                  }`}
                >
                  {entry.score}
                </span>
                <span className="text-sm text-gray-400">/10</span>
              </div>
            </div>
            <p className="mt-2 text-sm text-gray-600 line-clamp-2">
              {entry.preview}
            </p>
            <div className="mt-2 text-xs text-gray-400">
              时长：{Math.floor(entry.duration / 60)}分{entry.duration % 60}秒
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
