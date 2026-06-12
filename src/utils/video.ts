/**
 * 从 video 元素中提取当前帧的 ImageData
 *
 * 创建离屏 Canvas，将 video 当前画面绘制到 Canvas 上，
 * 再通过 getImageData 提取像素数据。这是视频帧处理的最基础原子操作。
 *
 * @param video - 正在播放的 HTMLVideoElement，需已绑定 MediaStream
 * @returns 当前帧的 ImageData，包含 width/height/data 属性
 * @throws 若 video 尚未开始播放（videoWidth 为 0）则抛出错误
 */
export function captureFrame(video: HTMLVideoElement): ImageData {
  const { videoWidth, videoHeight } = video;

  // 确保视频已开始播放且有画面数据
  if (videoWidth === 0 || videoHeight === 0) {
    throw new Error('视频尚未开始播放，无法提取帧数据');
  }

  // 创建离屏 Canvas，尺寸匹配视频实际分辨率
  const canvas = document.createElement('canvas');
  canvas.width = videoWidth;
  canvas.height = videoHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('无法获取 Canvas 2D 上下文');
  }

  // 将视频帧绘制到 Canvas
  ctx.drawImage(video, 0, 0, videoWidth, videoHeight);

  // 提取 ImageData
  return ctx.getImageData(0, 0, videoWidth, videoHeight);
}

/**
 * 将 ImageData 编码为 JPEG 格式的 Base64 字符串
 *
 * 通过离屏 Canvas 的 toDataURL 方法将像素数据编码为 JPEG，
 * 可通过 quality 参数控制压缩率以平衡画质与传输体积。
 *
 * @param imageData - 要编码的像素数据
 * @param quality - JPEG 压缩质量 0-1，默认 0.6
 * @returns Base64 编码的 data URL 字符串（data:image/jpeg;base64,...）
 */
export function imageDataToBase64(imageData: ImageData, quality = 0.6): string {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('无法获取 Canvas 2D 上下文');
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/jpeg', quality);
}

/**
 * 帧采样器
 *
 * 基于时间戳控制帧采样频率，避免每一帧都触发处理逻辑。
 * 用于调节云端上传频率、降低 API 调用成本。
 *
 * 使用方式：
 * ```ts
 * const sampler = new FrameSampler(2); // 每秒最多 2 帧
 *
 * function onFrame(now: number) {
 *   if (sampler.shouldSample(now)) {
 *     const frame = captureFrame(video);
 *     // 处理帧...
 *   }
 * }
 * ```
 */
export class FrameSampler {
  /** 目标帧率（每秒帧数） */
  readonly fps: number;
  /** 最小采样间隔（毫秒） */
  private readonly minInterval: number;
  /** 上一次采样的时间戳 */
  private lastSampleTime = 0;

  /**
   * @param fps - 目标采样帧率，默认 2fps，即每 500ms 采样一次
   */
  constructor(fps = 2) {
    this.fps = fps;
    this.minInterval = 1000 / fps;
  }

  /**
   * 判断当前时刻是否应该采样
   *
   * @param now - 当前时间戳（毫秒），通常来自 performance.now() 或 requestAnimationFrame 回调参数
   * @returns 距上次采样超过最小间隔时返回 true
   */
  shouldSample(now: number): boolean {
    if (now - this.lastSampleTime >= this.minInterval) {
      this.lastSampleTime = now;
      return true;
    }
    return false;
  }

  /**
   * 重置采样器状态
   */
  reset(): void {
    this.lastSampleTime = 0;
  }
}
