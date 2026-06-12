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

  let barColor = 'bg-blue-500';
  if (isTimeout) barColor = 'bg-red-600';
  else if (remaining <= 10) barColor = 'bg-red-500 animate-pulse';
  else if (isWarning) barColor = 'bg-orange-500';

  return (
    <div className="flex items-center gap-3">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200">
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
        className={`min-w-[4rem] text-right text-sm font-mono font-medium ${
          isTimeout
            ? 'text-red-600'
            : remaining <= 10
              ? 'text-red-500'
              : isWarning
                ? 'text-orange-600'
                : 'text-gray-600'
        }`}
      >
        {formatTime(remaining)}
      </span>
    </div>
  );
}
