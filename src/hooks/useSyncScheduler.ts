import { useState, useRef, useCallback, useEffect } from 'react';
import type { STTState } from '@/types';
import { FrameSampler, captureFrame, frameDifference } from '@/utils/video';

/** 调度器配置 */
export interface SyncSchedulerConfig {
  /** 云端上传最小间隔（毫秒），默认 5000 */
  uploadInterval?: number;
  /** 帧差异阈值 0-1，低于此值时跳过上传 */
  diffThreshold?: number;
  /** 本地人脸分析间隔（毫秒），默认 500 */
  localAnalysisInterval?: number;
}

/** 调度器返回值 */
export interface UseSyncSchedulerReturn {
  /** 最近一次上传的帧（Base64），用于 LLM 请求 */
  lastUploadedFrame: string | null;
  /** 是否正在上传 */
  isUploading: boolean;
  /** 本次会话已上传帧次数 */
  uploadCount: number;
  /** 本次会话已跳过帧次数（画面无变化） */
  skipCount: number;
  /** 手动触发一次帧上传（忽略策略） */
  forceUpload: () => string | null;
  /** 重置统计 */
  reset: () => void;
}

/**
 * 端云协同调度器 Hook
 *
 * 综合用户语音状态和画面变化，决定何时将摄像头帧上传至云端。
 * 减少不必要的 API 调用以控制成本，同时在关键对话时刻保持视觉感知。
 *
 * 决策规则：
 * 1. 用户未在说话（STT idle）→ 暂停上传
 * 2. 画面变化小于阈值 → 跳过本次上传
 * 3. 距上次上传小于最小间隔 → 跳过本次上传
 *
 * @param videoRef - 摄像头 video 元素引用
 * @param sttState - 当前语音识别状态
 * @param config - 调度配置
 */
export default function useSyncScheduler(
  videoRef: HTMLVideoElement | null,
  sttState: STTState,
  config: SyncSchedulerConfig = {},
): UseSyncSchedulerReturn {
  const {
    uploadInterval = 5000,
    diffThreshold = 0.1,
    localAnalysisInterval = 500,
  } = config;

  const [lastUploadedFrame, setLastUploadedFrame] = useState<string | null>(
    null,
  );
  const [isUploading, setIsUploading] = useState(false);
  const [uploadCount, setUploadCount] = useState(0);
  const [skipCount, setSkipCount] = useState(0);

  const frameSamplerRef = useRef(new FrameSampler(1000 / uploadInterval));
  const lastFrameRef = useRef<ImageData | null>(null);
  const mountedRef = useRef(true);

  /**
   * 提取并上传当前帧
   */
  const captureAndUpload = useCallback((): string | null => {
    if (!videoRef || !mountedRef.current) return null;

    try {
      const frame = captureFrame(videoRef);
      const canvas = document.createElement('canvas');
      canvas.width = frame.width;
      canvas.height = frame.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.putImageData(frame, 0, 0);
      const base64 = canvas.toDataURL('image/jpeg', 0.6);

      if (mountedRef.current) {
        setLastUploadedFrame(base64);
        setUploadCount((c) => c + 1);
      }
      return base64;
    } catch {
      return null;
    }
  }, [videoRef]);

  /**
   * 强制上传（忽略所有策略）
   */
  const forceUpload = useCallback((): string | null => {
    setIsUploading(true);
    const frame = captureAndUpload();
    setIsUploading(false);
    return frame;
  }, [captureAndUpload]);

  /**
   * 重置统计
   */
  const reset = useCallback(() => {
    setUploadCount(0);
    setSkipCount(0);
    setLastUploadedFrame(null);
    lastFrameRef.current = null;
    frameSamplerRef.current.reset();
  }, []);

  /**
   * 主调度循环
   *
   * 使用 requestAnimationFrame 进行本地帧分析，
   * 根据语音状态和画面变化决定是否上传。
   */
  useEffect(() => {
    if (!videoRef) return;
    mountedRef.current = true;

    // 本地分析采样器
    const localSampler = new FrameSampler(1000 / localAnalysisInterval);
    let rafId: number;

    const loop = (now: number) => {
      // 仅当用户在说话或面试进行中时上传
      const shouldUpload = sttState === 'listening';

      if (shouldUpload && localSampler.shouldSample(now)) {
        try {
          const currentFrame = captureFrame(videoRef);
          const lastFrame = lastFrameRef.current;

          // 检查帧差异
          if (lastFrame) {
            const diff = frameDifference(lastFrame, currentFrame);
            if (diff < diffThreshold) {
              // 画面静止，跳过上传
              if (mountedRef.current) setSkipCount((c) => c + 1);
              lastFrameRef.current = currentFrame;
              rafId = requestAnimationFrame(loop);
              return;
            }
          }

          lastFrameRef.current = currentFrame;

          // 检查上传间隔
          const uploadSampler = frameSamplerRef.current;
          if (uploadSampler.shouldSample(now)) {
            setIsUploading(true);
            captureAndUpload();
            setIsUploading(false);
          }
        } catch {
          // 帧提取失败，跳过
        }
      }

      if (mountedRef.current) {
        rafId = requestAnimationFrame(loop);
      }
    };

    rafId = requestAnimationFrame(loop);

    return () => {
      mountedRef.current = false;
      cancelAnimationFrame(rafId);
    };
  }, [videoRef, sttState, uploadInterval, diffThreshold, localAnalysisInterval, captureAndUpload]);

  return {
    lastUploadedFrame,
    isUploading,
    uploadCount,
    skipCount,
    forceUpload,
    reset,
  };
}
