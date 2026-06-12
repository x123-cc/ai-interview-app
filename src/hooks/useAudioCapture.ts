import { useState, useRef, useCallback, useEffect } from 'react';
import type {
  AudioCaptureState,
  AudioCaptureError,
  AudioCaptureErrorType,
  UseAudioCaptureOptions,
  UseAudioCaptureReturn,
} from '@/types';

/**
 * 将 DOMException 映射为音频错误类型
 */
function mapAudioErrorType(error: DOMException): AudioCaptureErrorType {
  switch (error.name) {
    case 'NotAllowedError':
      return 'NotAllowedError';
    case 'NotFoundError':
      return 'NotFoundError';
    case 'NotReadableError':
      return 'NotReadableError';
    default:
      return 'UnknownError';
  }
}

/**
 * 获取友好的中文错误提示
 */
function getAudioErrorMessage(type: AudioCaptureErrorType): string {
  switch (type) {
    case 'NotAllowedError':
      return '麦克风权限被拒绝，请在浏览器设置中允许访问麦克风';
    case 'NotFoundError':
      return '未检测到麦克风设备，请确认麦克风已连接';
    case 'NotReadableError':
      return '麦克风被其他应用占用，请关闭其他使用麦克风的程序';
    default:
      return '麦克风访问发生未知错误，请刷新页面后重试';
  }
}

/**
 * 计算音量 RMS 分贝值（0-100 映射）
 *
 * 从 AnalyserNode 获取时域数据，计算 RMS 后转为分贝值，
 * 再线性映射到 0-100 便于 UI 展示。
 */
function computeVolumeLevel(analyser: AnalyserNode): number {
  const dataArray = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(dataArray);

  // 计算 RMS
  let sumSquares = 0;
  for (let i = 0; i < dataArray.length; i++) {
    // 归一化到 -1..1，128 为零点
    const normalized = (dataArray[i] - 128) / 128;
    sumSquares += normalized * normalized;
  }
  const rms = Math.sqrt(sumSquares / dataArray.length);

  // RMS 转分贝，设定最小阈值避免 -Infinity
  const db = 20 * Math.log10(Math.max(rms, 1e-6));
  // 将分贝范围（-120 ~ 0）映射到 0-100
  const level = Math.max(0, Math.min(100, ((db + 60) / 60) * 100));

  return Math.round(level);
}

/**
 * 音频采集 Hook
 *
 * 封装 navigator.mediaDevices.getUserMedia({ audio: true })，
 * 管理权限请求、状态转换、音量实时监测和资源释放。
 * 组件卸载时自动停止麦克风采集并关闭 AudioContext。
 *
 * @param options - 音频采集配置选项
 * @returns 音频状态、音量级别和控制方法
 */
export default function useAudioCapture(
  options: UseAudioCaptureOptions = {},
): UseAudioCaptureReturn {
  const [state, setState] = useState<AudioCaptureState>('idle');
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [error, setError] = useState<AudioCaptureError | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  /**
   * 释放所有音频资源（流、AudioContext、动画帧）
   */
  const releaseAll = useCallback(() => {
    // 停止音量监测循环
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    // 关闭 AudioContext
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
      analyserRef.current = null;
    }
    // 停止媒体轨道
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  /**
   * 启动音量监测循环（requestAnimationFrame）
   */
  const startVolumeLoop = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const loop = () => {
      const level = computeVolumeLevel(analyser);
      setVolumeLevel(level);
      animFrameRef.current = requestAnimationFrame(loop);
    };
    animFrameRef.current = requestAnimationFrame(loop);
  }, []);

  /**
   * 启动麦克风采集
   *
   * 流程：idle → requesting → active（成功）或 denied/error（失败）
   * 同时创建 AudioContext 和 AnalyserNode 用于音量监测。
   */
  const start = useCallback(async () => {
    if (streamRef.current) {
      releaseAll();
    }

    setState('requesting');
    setError(null);

    try {
      const constraints: MediaStreamConstraints = {
        audio: options.deviceId
          ? { deviceId: { exact: options.deviceId } }
          : true,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      // 创建 AudioContext 和 AnalyserNode 用于音量监测
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.4;
      source.connect(analyser);
      // 不连接到 destination，避免回声

      audioCtxRef.current = audioCtx;
      analyserRef.current = analyser;

      startVolumeLoop();
      setState('active');
    } catch (err) {
      releaseAll();
      const audioError: AudioCaptureError = {
        type:
          err instanceof DOMException ? mapAudioErrorType(err) : 'UnknownError',
        message:
          err instanceof DOMException
            ? getAudioErrorMessage(mapAudioErrorType(err))
            : getAudioErrorMessage('UnknownError'),
      };
      setError(audioError);
      setState(audioError.type === 'NotAllowedError' ? 'denied' : 'error');
    }
  }, [options.deviceId, releaseAll, startVolumeLoop]);

  /**
   * 停止麦克风采集并释放所有资源
   */
  const stop = useCallback(() => {
    releaseAll();
    setVolumeLevel(0);
    setState('idle');
    setError(null);
  }, [releaseAll]);

  /**
   * 组件卸载时自动释放所有资源
   */
  useEffect(() => {
    return () => {
      releaseAll();
    };
  }, [releaseAll]);

  return { state, volumeLevel, error, start, stop };
}
