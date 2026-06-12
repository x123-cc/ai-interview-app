import { useState, useRef, useCallback, useEffect } from 'react';

/** useTimer 返回值 */
export interface UseTimerReturn {
  /** 剩余秒数 */
  remaining: number;
  /** 是否计时中 */
  isRunning: boolean;
  /** 是否已超时 */
  isTimeout: boolean;
  /** 进度 0-1 */
  progress: number;
  /** 是否处于警告状态（最后 10 秒） */
  isWarning: boolean;
  /** 开始计时 */
  start: () => void;
  /** 暂停计时 */
  pause: () => void;
  /** 重置计时（回到初始时长） */
  reset: () => void;
}

/**
 * 通用倒计时 Hook
 *
 * @param durationSeconds - 总秒数，0 表示不限时
 * @param onTimeout - 超时回调
 */
export default function useTimer(
  durationSeconds: number,
  onTimeout?: () => void,
): UseTimerReturn {
  const [remaining, setRemaining] = useState(durationSeconds);
  const [isRunning, setIsRunning] = useState(false);
  const [isTimeout, setIsTimeout] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onTimeoutRef = useRef(onTimeout);
  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  const clearTimer = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    if (durationSeconds <= 0) return;
    clearTimer();
    setIsRunning(true);
    setIsTimeout(false);
  }, [durationSeconds, clearTimer]);

  const pause = useCallback(() => {
    clearTimer();
    setIsRunning(false);
  }, [clearTimer]);

  const reset = useCallback(() => {
    clearTimer();
    setRemaining(durationSeconds);
    setIsRunning(false);
    setIsTimeout(false);
  }, [durationSeconds, clearTimer]);

  useEffect(() => {
    if (!isRunning) return;

    intervalRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearTimer();
          setIsRunning(false);
          setIsTimeout(true);
          onTimeoutRef.current?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return clearTimer;
  }, [isRunning, clearTimer]);

  // 组件卸载清理
  useEffect(() => clearTimer, [clearTimer]);

  const progress = durationSeconds > 0 ? remaining / durationSeconds : 1;
  const isWarning = remaining <= 10 && isRunning;

  return {
    remaining,
    isRunning,
    isTimeout,
    progress,
    isWarning,
    start,
    pause,
    reset,
  };
}
