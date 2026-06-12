export interface TimerBarProps {
  /** 剩余秒数 */
  remaining: number;
  /** 总秒数 */
  total: number;
  /** 是否警告状态 */
  isWarning: boolean;
  /** 是否已超时 */
  isTimeout: boolean;
}

/** 格式化 MM:SS */
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/**
 * 计时器柱状条组件
 *
 * 展示倒计时进度和剩余时间，颜色随剩余时间变化：
 * - 蓝色：正常（> 30s）
 * - 橙色：警告（≤ 30s）
 * - 红色 + 脉冲：紧急（≤ 10s）
 */
export default function TimerBar({
  remaining,
  total,
  isWarning,
  isTimeout,
}: TimerBarProps) {
  const progress = total > 0 ? (remaining / total) * 100 : 100;

  let barColor = 'bg-[#0071e3]';
  if (isTimeout) barColor = 'bg-[#ff3b30]';
  else if (remaining <= 10) barColor = 'bg-[#ff3b30] animate-pulse';
  else if (isWarning) barColor = 'bg-[#ff9500]';

  return (
    <div className="flex items-center gap-3">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#e8e8ed]">
        <div
          className={`h-full rounded-full transition-all duration-1000 ease-linear ${barColor}`}
          style={{ width: `${progress}%` }}
          role="progressbar"
          aria-valuenow={remaining}
          aria-valuemin={0}
          aria-valuemax={total}
        />
      </div>
      <span
        className={`min-w-[3.5rem] text-right text-[0.8125rem] font-medium tabular-nums tracking-tight ${
          isTimeout
            ? 'text-[#ff3b30]'
            : remaining <= 10
              ? 'text-[#ff3b30]'
              : isWarning
                ? 'text-[#ff9500]'
                : 'text-[#86868b]'
        }`}
      >
        {formatTime(remaining)}
      </span>
    </div>
  );
}
