export interface VolumeMeterProps {
  /** 音量级别 0-100，来自 useAudioCapture 的 volumeLevel */
  level: number;
  /** 麦克风是否处于活跃采集状态 */
  isActive: boolean;
}

/**
 * 根据音量级别返回对应颜色类名
 */
function getColorClass(level: number, isActive: boolean): string {
  if (!isActive) return 'bg-gray-300';
  if (level < 50) return 'bg-green-500';
  if (level < 80) return 'bg-yellow-500';
  return 'bg-red-500';
}

/**
 * 音量指示器组件
 *
 * 接收音量级别（0-100）渲染柱状条，颜色根据音量分档：
 * - 灰色：麦克风未激活
 * - 绿色：正常音量（0-49）
 * - 黄色：偏高音量（50-79）
 * - 红色：过载音量（80-100）
 *
 * 职责单一：只负责"可视化音量数据"，不关心数据来源。
 */
export default function VolumeMeter({ level, isActive }: VolumeMeterProps) {
  // 将 level 限制在 0-100 范围内
  const clampedLevel = Math.max(0, Math.min(100, level));
  const barColor = getColorClass(clampedLevel, isActive);

  return (
    <div className="flex items-center gap-2">
      {/* 柱状条容器 */}
      <div className="h-3 flex-1 overflow-hidden rounded-full bg-gray-200">
        <div
          className={`h-full rounded-full transition-all duration-150 ease-out ${barColor}`}
          style={{ width: `${clampedLevel}%` }}
          role="meter"
          aria-valuenow={clampedLevel}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`当前音量 ${clampedLevel}%`}
        />
      </div>

      {/* 音量数值 */}
      <span className="w-10 text-right text-xs text-gray-500 select-none">
        {clampedLevel}%
      </span>
    </div>
  );
}
