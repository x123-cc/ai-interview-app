import type { InterviewScores, ScoreDimension } from '@/utils/scoring';

interface ScorePanelProps {
  scores: InterviewScores;
  duration: number;
  questionCount: number;
  onViewHistory: () => void;
  onClose: () => void;
}

const DIMENSION_MAX = 10;

function ScoreBar({ dim }: { dim: ScoreDimension }) {
  const pct = (dim.score / DIMENSION_MAX) * 100;
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 text-[0.8125rem] font-medium text-[#1d1d1f]">{dim.name}</span>
      <div className="flex-1 h-1.5 rounded-full bg-[#e8e8ed] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${pct}%`,
            backgroundColor:
              dim.score >= 8 ? '#34c759' : dim.score >= 6 ? '#ff9500' : '#ff3b30',
          }}
        />
      </div>
      <span className="w-7 text-right text-[0.8125rem] font-semibold tabular-nums text-[#1d1d1f]">
        {dim.score}
      </span>
      <span className="text-[0.6875rem] text-[#aeaeb2]">/10</span>
    </div>
  );
}

export default function ScorePanel({
  scores,
  duration,
  questionCount,
  onViewHistory,
  onClose,
}: ScorePanelProps) {
  const durationMin = Math.floor(duration / 60);
  const durationSec = duration % 60;

  return (
    <div className="flex flex-col items-center px-4 py-8">
      {/* 总分 */}
      <div className="mb-6 text-center">
        <p className="text-[0.8125rem] font-medium tracking-tight text-[#86868b]">面试综合评分</p>
        <div className="mt-1 flex items-baseline justify-center gap-1">
          <span className="text-[3.5rem] font-bold tracking-[-0.04em] text-[#1d1d1f] leading-none">
            {scores.totalScore}
          </span>
          <span className="text-[1.25rem] text-[#86868b]">/10</span>
        </div>
      </div>

      {/* 分维度 */}
      <div className="w-full max-w-md space-y-3 mb-6">
        {scores.dimensions.map((dim) => (
          <div key={dim.name}>
            <ScoreBar dim={dim} />
            <p className="mt-0.5 ml-[5.75rem] text-[0.6875rem] text-[#aeaeb2]">{dim.comment}</p>
          </div>
        ))}
      </div>

      {/* 总结 */}
      <div className="w-full max-w-md mb-6 rounded-2xl bg-[#f5f5f7] p-4">
        <p className="text-[0.8125rem] font-medium text-[#1d1d1f] mb-1">总评</p>
        <p className="text-[0.8125rem] leading-relaxed text-[#86868b]">{scores.summary}</p>
      </div>

      {/* 面试概况 */}
      <div className="w-full max-w-md grid grid-cols-3 gap-3 mb-8">
        <div className="rounded-xl bg-[#f5f5f7] px-3 py-2.5 text-center">
          <p className="text-[1.125rem] font-semibold tabular-nums text-[#1d1d1f]">{questionCount}</p>
          <p className="text-[0.6875rem] text-[#86868b]">问题数</p>
        </div>
        <div className="rounded-xl bg-[#f5f5f7] px-3 py-2.5 text-center">
          <p className="text-[1.125rem] font-semibold tabular-nums text-[#1d1d1f]">
            {durationMin}:{String(durationSec).padStart(2, '0')}
          </p>
          <p className="text-[0.6875rem] text-[#86868b]">时长</p>
        </div>
        <div className="rounded-xl bg-[#f5f5f7] px-3 py-2.5 text-center">
          <p className="text-[1.125rem] font-semibold tabular-nums text-[#1d1d1f]">
            {scores.dimensions.reduce((a, b) => a.score > b.score ? a : b).name.slice(0, 2)}
          </p>
          <p className="text-[0.6875rem] text-[#86868b]">最强维度</p>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center gap-3">
        <button onClick={onViewHistory} className="apple-btn-primary">
          查看历史记录
        </button>
        <button onClick={onClose} className="apple-btn-secondary">
          返回对话
        </button>
      </div>
    </div>
  );
}
