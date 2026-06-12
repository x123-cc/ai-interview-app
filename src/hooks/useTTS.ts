import { useState, useRef, useCallback, useEffect } from 'react';
import type { TTSState, TTSVoiceOptions, UseTTSReturn } from '@/types';

/** 队列项 */
interface QueueItem {
  text: string;
  options?: TTSVoiceOptions;
}

/** 最大队列深度，防止无限制入队导致内存溢出 */
const MAX_QUEUE_SIZE = 50;

/**
 * 语音合成 Hook（TTS — Text to Speech）
 *
 * 封装浏览器原生 SpeechSynthesis API，提供 FIFO 语音队列、
 * 逐条顺序播报、播放控制和无障碍支持。
 *
 * 使用方式：
 * ```ts
 * const tts = useTTS();
 * tts.speak('你好');
 * tts.speak('欢迎参加模拟面试'); // 前一句播完自动播放这一句
 * ```
 *
 * @returns 播放状态和控制方法
 */
export default function useTTS(): UseTTSReturn {
  const [state, setState] = useState<TTSState>('idle');
  const queueRef = useRef<QueueItem[]>([]);
  const isProcessingRef = useRef(false);
  const mountedRef = useRef(true);
  // 用 ref 持有 processNext 自身引用，解决 useCallback 循环依赖
  const processNextRef = useRef<() => void>(() => {});

  const isSupported =
    typeof window !== 'undefined' &&
    typeof window.speechSynthesis !== 'undefined';

  /**
   * 处理队列中的下一条语音
   *
   * 从队列头部取出文本，创建 utterance 并播报。
   * 播完后通过 onend/onerror 递归调用自身处理下一条。
   */
  const processNext = useCallback(() => {
    if (!mountedRef.current) return;

    const queue = queueRef.current;
    if (queue.length === 0) {
      isProcessingRef.current = false;
      setState('idle');
      return;
    }

    const item = queue.shift()!;
    isProcessingRef.current = true;

    // 创建 utterance 并应用选项
    const utterance = new SpeechSynthesisUtterance(item.text);
    utterance.rate = item.options?.rate ?? 1.0;
    utterance.pitch = item.options?.pitch ?? 1.0;
    utterance.volume = item.options?.volume ?? 1.0;
    utterance.lang = item.options?.lang ?? 'zh-CN';

    utterance.onstart = () => {
      if (mountedRef.current) setState('speaking');
    };

    utterance.onend = () => {
      processNextRef.current();
    };

    utterance.onerror = () => {
      // 出错时跳过本条，继续处理下一条
      processNextRef.current();
    };

    window.speechSynthesis.speak(utterance);
  }, []);

  // 保持 ref 指向最新的 processNext
  useEffect(() => {
    processNextRef.current = processNext;
  }, [processNext]);

  /**
   * 播报指定文本（加入队列尾部）
   *
   * 若当前无播放则立即开始，否则排队等待。
   *
   * @param text - 要播报的文本
   * @param options - 语速、音调、音量、语言等选项
   */
  const speak = useCallback(
    (text: string, options?: TTSVoiceOptions) => {
      if (!isSupported || !text.trim()) return;

      // 队列已满时，移除最旧的条目
      if (queueRef.current.length >= MAX_QUEUE_SIZE) {
        queueRef.current.shift();
      }

      queueRef.current.push({ text, options });

      // 若未在处理中，立即开始
      if (!isProcessingRef.current) {
        processNext();
      }
    },
    [isSupported, processNext],
  );

  /**
   * 批量播报多段文本
   *
   * @param texts - 要播报的文本数组
   * @param options - 应用于所有文本的选项
   */
  const speakAll = useCallback(
    (texts: string[], options?: TTSVoiceOptions) => {
      if (!isSupported) return;
      for (const text of texts) {
        speak(text, options);
      }
    },
    [isSupported, speak],
  );

  /**
   * 停止所有语音并清空队列
   */
  const stop = useCallback(() => {
    if (!isSupported) return;
    window.speechSynthesis.cancel();
    queueRef.current = [];
    isProcessingRef.current = false;
    if (mountedRef.current) setState('idle');
  }, [isSupported]);

  /**
   * 暂停当前语音（队列保留）
   */
  const pause = useCallback(() => {
    if (!isSupported) return;
    window.speechSynthesis.pause();
    if (mountedRef.current) setState('paused');
  }, [isSupported]);

  /**
   * 恢复暂停的语音
   */
  const resume = useCallback(() => {
    if (!isSupported) return;
    window.speechSynthesis.resume();
    if (mountedRef.current) setState('speaking');
  }, [isSupported]);

  /**
   * 组件卸载时取消播报并清空队列
   */
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (isSupported) {
        window.speechSynthesis.cancel();
      }
      queueRef.current = [];
      isProcessingRef.current = false;
    };
  }, [isSupported]);

  return { state, isSupported, speak, speakAll, stop, pause, resume };
}
