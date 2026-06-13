import { useEffect, useRef, useCallback, useState } from 'react';
import type { ChatMessage } from '@/types';

interface VisionMonitorOptions {
  /** 截图间隔（秒），默认 20 */
  intervalSeconds?: number;
  /** 是否启用 */
  enabled: boolean;
  /** 摄像头流 */
  stream: MediaStream | null;
  /** API Key */
  apiKey: string;
  /** 服务商 baseUrl */
  baseUrl: string;
  /** 模型名 */
  model: string;
  /** 当有新的视觉分析结果时的回调 */
  onVisionResult?: (msg: ChatMessage) => void;
}

/** 从已有 DOM video 元素抓取一帧 base64（优先），失败则创建临时 video */
function captureFrame(stream: MediaStream): Promise<string | null> {
  return new Promise((resolve) => {
    // 优先从已渲染的 video 元素抓帧（无需 play()，无用户手势限制）
    const existingVideo = document.querySelector('video');
    if (existingVideo && existingVideo.videoWidth > 0) {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 480;
        canvas.height = 360;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(existingVideo, 0, 0, canvas.width, canvas.height);
        const base64 = canvas.toDataURL('image/jpeg', 0.6);
        resolve(base64);
        return;
      } catch {
        // 抓帧失败，继续尝试临时 video
      }
    }

    // 降级：创建临时 video（可能因 autoplay 策略失败）
    const video = document.createElement('video');
    video.srcObject = stream;
    video.playsInline = true;
    video.muted = true;
    video.play().then(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 480;
      canvas.height = 360;
      const ctx = canvas.getContext('2d');
      if (!ctx) { video.pause(); video.srcObject = null; resolve(null); return; }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const base64 = canvas.toDataURL('image/jpeg', 0.6);
      video.pause();
      video.srcObject = null;
      resolve(base64);
    }).catch((e) => {
      console.warn('[VisionMonitor] 临时video播放失败:', e.message);
      video.srcObject = null;
      resolve(null);
    });
  });
}

const VISION_PROMPT = `分析这张面试截图，只关注以下两点，用 JSON 回复：
1. 候选人是否在注视屏幕？有没有频繁看向别处、低头、或离开画面？
2. 候选人的情绪状态如何？是否需要安抚？

严格按此格式回复：
{"lookingAtScreen":true/false,"suspicious":true/false,"emotion":"calm/nervous/confident/uncertain","needsComfort":true/false}`;

/**
 * 定时截图并调用 AI 进行视觉分析
 */
export function useVisionMonitor(options: VisionMonitorOptions) {
  const {
    intervalSeconds = 20,
    enabled,
    stream,
    apiKey,
    baseUrl,
    model,
    onVisionResult,
  } = options;

  const [lastResult, setLastResult] = useState<ChatMessage | null>(null);
  const analysingRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const analyse = useCallback(async () => {
    if (!enabled || !stream || !apiKey || analysingRef.current) return;

    analysingRef.current = true;
    try {
      const frame = await captureFrame(stream);
      if (!frame) {
        console.warn('[VisionMonitor] 抓帧失败：无画面数据');
        return;
      }

      const resp = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'user', content: VISION_PROMPT },
            {
              role: 'user',
              content: [
                { type: 'text', text: '分析这张面试截图' },
                { type: 'image_url', image_url: { url: frame, detail: 'low' } },
              ],
            },
          ],
          max_tokens: 150,
          temperature: 0.3,
        }),
      });

      if (!resp.ok) {
        console.warn(`[VisionMonitor] API请求失败 HTTP ${resp.status}`);
        return;
      }

      const data = await resp.json();
      const content: string = data.choices?.[0]?.message?.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const parts: string[] = [];

        if (parsed.suspicious) {
          parts.push('⚠️ 检测到异常行为：候选人可能未专注面试');
        } else if (parsed.lookingAtScreen) {
          parts.push('👁 眼神专注，无作弊行为');
        }

        const emotionLabels: Record<string, string> = {
          calm: '😌 情绪平稳',
          nervous: '😰 略显紧张',
          confident: '😊 自信从容',
          uncertain: '🤔 略有犹豫',
        };
        parts.push(emotionLabels[parsed.emotion] || `情绪: ${parsed.emotion}`);

        if (parsed.needsComfort) {
          parts.push('💡 建议给予安抚鼓励');
        }

        const msg: ChatMessage = {
          role: 'system',
          text: parts.join(' · '),
          timestamp: Date.now(),
          systemType: parsed.suspicious ? 'alert' : 'vision',
        };

        setLastResult(msg);
        onVisionResult?.(msg);
      } else {
        console.warn('[VisionMonitor] LLM返回非JSON:', content.slice(0, 100));
      }
    } catch (err) {
      console.warn('[VisionMonitor] 分析失败:', err instanceof Error ? err.message : err);
    } finally {
      analysingRef.current = false;
    }
  }, [enabled, stream, apiKey, baseUrl, model, onVisionResult]);

  useEffect(() => {
    if (!enabled || !stream || !apiKey) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    // 首次延迟 5 秒后分析
    const initialTimer = setTimeout(() => analyse(), 5000);

    // 定时分析
    intervalRef.current = setInterval(() => analyse(), intervalSeconds * 1000);

    return () => {
      clearTimeout(initialTimer);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [enabled, stream, apiKey, intervalSeconds, analyse]);

  return { lastResult };
}
