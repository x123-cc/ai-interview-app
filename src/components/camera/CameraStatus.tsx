import type { CameraState, CameraError } from '@/types';

export interface CameraStatusProps {
  /** 摄像头当前状态 */
  state: CameraState;
  /** 错误详情，state 为 denied 或 error 时展示 */
  error: CameraError | null;
  /** 点击重试按钮的回调，通常调用 useCamera 的 start() */
  onRetry?: () => void;
}

/** 各状态对应的颜色和文案 */
const STATUS_CONFIG: Record<
  CameraState,
  { dotColor: string; pulse: boolean; label: string }
> = {
  idle: {
    dotColor: 'bg-gray-400',
    pulse: false,
    label: '等待启动摄像头',
  },
  requesting: {
    dotColor: 'bg-yellow-400',
    pulse: true,
    label: '正在请求摄像头权限...',
  },
  active: {
    dotColor: 'bg-green-500',
    pulse: false,
    label: '摄像头工作中',
  },
  denied: {
    dotColor: 'bg-red-500',
    pulse: false,
    label: '摄像头权限被拒绝',
  },
  error: {
    dotColor: 'bg-red-500',
    pulse: false,
    label: '摄像头发生错误',
  },
};

/**
 * 摄像头状态指示组件
 *
 * 根据 CameraState 展示不同的视觉状态：灰（空闲）、黄闪（请求中）、
 * 绿（工作中）、红（拒绝/错误）。在拒绝或错误状态下提供重试按钮。
 *
 * 职责单一：只负责"指示状态"，不负责获取或管理摄像头流。
 */
export default function CameraStatus({
  state,
  error,
  onRetry,
}: CameraStatusProps) {
  const config = STATUS_CONFIG[state];
  const isFaulted = state === 'denied' || state === 'error';

  return (
    <div className="flex items-center gap-2 rounded-lg bg-black/60 px-3 py-1.5 text-sm text-white backdrop-blur-sm">
      {/* 状态圆点 */}
      <span
        className={`inline-block h-2.5 w-2.5 rounded-full ${config.dotColor} ${config.pulse ? 'animate-pulse' : ''}`}
        aria-hidden="true"
      />

      {/* 状态文案 */}
      <span className="select-none">{config.label}</span>

      {/* 异常时展示错误详情和重试按钮 */}
      {isFaulted && error && (
        <span className="max-w-48 truncate text-xs text-gray-300">
          — {error.message}
        </span>
      )}
      {isFaulted && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="ml-1 rounded bg-white/20 px-2 py-0.5 text-xs font-medium text-white hover:bg-white/30 transition-colors"
        >
          重试
        </button>
      )}
    </div>
  );
}
