import { useState, useRef, useCallback, useEffect } from 'react';
import type { TTSState, TTSVoiceOptions, UseTTSReturn } from '@/types';

/**
 * 语音合成 Hook（TTS — Text to Speech）
 *
 * 封装浏览器原生 SpeechSynthesis API，提供语音播报、
 * 播放控制和资源管理。组件卸载时自动取消播报。
 *
 * 使用方式：
 * ```ts
 * const tts = useTTS();
 * tts.speak('你好，欢迎参加模拟面试');
 * ```
 *
 * @returns 播放状态和控制方法
 */
export default function useTTS(): UseTTSReturn {
  const [state, setState] = useState<TTSState>('idle');
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const mountedRef = useRef(true);

  // 检测浏览器是否支持 SpeechSynthesis
  const isSupported =
    typeof window !== 'undefined' &&
    typeof window.speechSynthesis !== 'undefined';

  /**
   * 创建 SpeechSynthesisUtterance 实例并应用选项
   */
  const createUtterance = useCallback(
    (text: string, options?: TTSVoiceOptions): SpeechSynthesisUtterance => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = options?.rate ?? 1.0;
      utterance.pitch = options?.pitch ?? 1.0;
      utterance.volume = options?.volume ?? 1.0;
      utterance.lang = options?.lang ?? 'zh-CN';

      utterance.onstart = () => {
        if (mountedRef.current) setState('speaking');
      };

      utterance.onend = () => {
        if (mountedRef.current) setState('idle');
      };

      // 播放出错时（如文本包含无法发音的字符），静默结束
      utterance.onerror = () => {
        if (mountedRef.current) setState('idle');
      };

      return utterance;
    },
    [],
  );

  /**
   * 播报指定文本
   *
   * 每次调用会取消当前正在播放的语音并立即播报新文本。
   *
   * @param text - 要播报的文本
   * @param options - 语速、音调、音量、语言等选项
   */
  const speak = useCallback(
    (text: string, options?: TTSVoiceOptions) => {
      if (!isSupported || !text.trim()) return;

      // 取消当前播放
      window.speechSynthesis.cancel();

      const utterance = createUtterance(text, options);
      currentUtteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    },
    [isSupported, createUtterance],
  );

  /**
   * 停止所有语音
   */
  const stop = useCallback(() => {
    if (!isSupported) return;
    window.speechSynthesis.cancel();
    if (mountedRef.current) setState('idle');
  }, [isSupported]);

  /**
   * 暂停当前语音
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
   * 组件卸载时取消播报
   */
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (isSupported) {
        window.speechSynthesis.cancel();
      }
    };
  }, [isSupported]);

  return { state, isSupported, speak, stop, pause, resume };
}
