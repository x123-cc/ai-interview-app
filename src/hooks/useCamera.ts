import { useState, useRef, useCallback, useEffect } from 'react';
import type {
  CameraState,
  CameraError,
  CameraErrorType,
  UseCameraOptions,
  UseCameraReturn,
} from '@/types';

/**
 * 将 DOMException 映射为 CameraErrorType
 */
function mapErrorType(error: DOMException): CameraErrorType {
  switch (error.name) {
    case 'NotAllowedError':
      return 'NotAllowedError';
    case 'NotFoundError':
      return 'NotFoundError';
    case 'NotReadableError':
      return 'NotReadableError';
    case 'OverconstrainedError':
      return 'OverconstrainedError';
    default:
      return 'UnknownError';
  }
}

/**
 * 获取友好的中文错误提示
 */
function getErrorMessage(type: CameraErrorType): string {
  switch (type) {
    case 'NotAllowedError':
      return '摄像头权限被拒绝，请在浏览器设置中允许访问摄像头';
    case 'NotFoundError':
      return '未检测到摄像头设备，请确认摄像头已连接';
    case 'NotReadableError':
      return '摄像头被其他应用占用，请关闭其他使用摄像头的程序';
    case 'OverconstrainedError':
      return '摄像头不满足指定的分辨率或朝向要求，已尝试降级';
    default:
      return '摄像头访问发生未知错误，请刷新页面后重试';
  }
}

/**
 * 摄像头采集 Hook
 *
 * 封装 navigator.mediaDevices.getUserMedia，管理权限请求、
 * 状态转换和资源释放。组件卸载时自动停止摄像头。
 *
 * @param options - 摄像头配置选项
 * @returns 摄像头状态、流对象和控制方法
 */
export default function useCamera(
  options: UseCameraOptions = {},
): UseCameraReturn {
  const [state, setState] = useState<CameraState>('idle');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<CameraError | null>(null);
  // 仅用于清理，不在 render 中直接读取 current 值
  const streamRef = useRef<MediaStream | null>(null);

  /**
   * 构建 getUserMedia 约束条件
   */
  const buildConstraints = useCallback((): MediaStreamConstraints => {
    const videoConstraints: MediaTrackConstraints = {};
    // 摄像头朝向
    videoConstraints.facingMode = options.facingMode ?? 'user';
    // 分辨率约束
    if (options.width) {
      videoConstraints.width = { ideal: options.width };
    }
    if (options.height) {
      videoConstraints.height = { ideal: options.height };
    }
    return { video: videoConstraints };
  }, [options.facingMode, options.width, options.height]);

  /**
   * 停止所有摄像头轨道并释放 MediaStream
   */
  const releaseStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  /**
   * 启动摄像头采集
   *
   * 流程：idle → requesting → active（成功）或 denied/error（失败）
   * 如果当前已是 active 状态，先释放旧流再重新请求
   */
  const start = useCallback(async () => {
    // 如果已有活跃流，先停止
    if (streamRef.current) {
      releaseStream();
    }

    setState('requesting');
    setError(null);

    try {
      const mediaStream =
        await navigator.mediaDevices.getUserMedia(buildConstraints());
      streamRef.current = mediaStream;
      setStream(mediaStream);
      setState('active');
    } catch (err) {
      releaseStream();
      setStream(null);
      const cameraError: CameraError = {
        type: err instanceof DOMException ? mapErrorType(err) : 'UnknownError',
        message:
          err instanceof DOMException
            ? getErrorMessage(mapErrorType(err))
            : getErrorMessage('UnknownError'),
      };
      setError(cameraError);
      setState(cameraError.type === 'NotAllowedError' ? 'denied' : 'error');
    }
  }, [buildConstraints, releaseStream]);

  /**
   * 停止摄像头采集并释放资源
   */
  const stop = useCallback(() => {
    releaseStream();
    setStream(null);
    setState('idle');
    setError(null);
  }, [releaseStream]);

  /**
   * 组件卸载时自动释放摄像头资源
   */
  useEffect(() => {
    return () => {
      releaseStream();
    };
  }, [releaseStream]);

  return { state, stream, error, start, stop };
}
