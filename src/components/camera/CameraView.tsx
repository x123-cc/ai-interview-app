import { useRef, useEffect, type VideoHTMLAttributes } from 'react';

export interface CameraViewProps extends VideoHTMLAttributes<HTMLVideoElement> {
  /** 要渲染的 MediaStream，通常来自 useCamera Hook */
  stream: MediaStream | null;
  /** 是否镜像翻转画面，默认 true（适配前置摄像头习惯） */
  mirrored?: boolean;
}

/**
 * 摄像头画面展示组件
 *
 * 将 MediaStream 绑定到 <video> 元素，渲染实时摄像头画面。
 * 仅负责"展示"，不关心权限获取逻辑——stream 由外部 useCamera Hook 提供。
 *
 * @param stream - 摄像头媒体流，为 null 时不渲染画面
 * @param mirrored - 是否水平镜像，前置摄像头场景下默认为 true
 */
export default function CameraView({
  stream,
  mirrored = true,
  className = '',
  ...videoProps
}: CameraViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  /**
   * 将 MediaStream 绑定到 video 元素
   * stream 变化时自动切换，组件卸载时自动解绑
   */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // 绑定新的媒体流
    if (stream && video.srcObject !== stream) {
      video.srcObject = stream;
      video.play().catch(() => {
        // 浏览器自动播放策略可能阻止，静默处理
      });
    }

    // 外部传入 null 时清空画面
    if (!stream) {
      video.srcObject = null;
    }

    return () => {
      // 卸载时解绑，避免内存泄漏
      if (video.srcObject) {
        video.srcObject = null;
      }
    };
  }, [stream]);

  return (
    <video
      ref={videoRef}
      className={`w-full h-full object-cover ${className}`}
      style={mirrored ? { transform: 'scaleX(-1)' } : undefined}
      muted
      playsInline
      autoPlay
      {...videoProps}
    />
  );
}
