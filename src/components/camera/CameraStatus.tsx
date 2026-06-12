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
  idle: { dotColor: 'bg-[#aeaeb2]', pulse: false, label: '等待启动' },
  requesting: { dotColor: 'bg-[#ff9500]', pulse: true, label: '请求权限中...' },
  active: { dotColor: 'bg-[#34c759]', pulse: false, label: '工作中' },
  denied: { dotColor: 'bg-[#ff3b30]', pulse: false, label: '权限被拒绝' },
  error: { dotColor: 'bg-[#ff3b30]', pulse: false, label: '发生错误' },
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
    <div className="flex items-center gap-2 rounded-full bg-black/40 px-3 py-1 text-[0.6875rem] text-white/80 backdrop-blur-md">
      <span
        className={`inline-block h-2 w-2 rounded-full ${config.dotColor} ${config.pulse ? 'animate-pulse' : ''}`}
        aria-hidden="true"
      />
      <span className="select-none">{config.label}</span>
      {isFaulted && error && (
        <span className="max-w-36 truncate text-white/50">— {error.message}</span>
      )}
      {isFaulted && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="ml-1 rounded-full bg-white/15 px-2 py-0.5 text-[0.625rem] font-medium text-white hover:bg-white/25 transition-colors"
        >
          重试
        </button>
      )}
    </div>
  );
}
