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
