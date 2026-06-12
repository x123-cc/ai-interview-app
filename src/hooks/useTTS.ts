import { useState, useRef, useCallback, useEffect } from 'react';
import type {
  TTSState,
  TTSVoiceInfo,
  TTSVoiceOptions,
  UseTTSReturn,
} from '@/types';

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
 * 语音选择、语速/音调控制和逐条顺序播报。
 *
 * 使用方式：
 * ```ts
 * const tts = useTTS();
 * tts.setRate(1.2);
 * tts.speak('你好，欢迎参加模拟面试');
 * ```
 *
 * @returns 播放状态、语音列表和控制方法
 */
export default function useTTS(): UseTTSReturn {
  const [state, setState] = useState<TTSState>('idle');
  const [voices, setVoices] = useState<TTSVoiceInfo[]>([]);
  const [activeVoiceURI, setActiveVoiceURI] = useState<string | null>(null);
  const [rate, setRateState] = useState(1.0);
  const [pitch, setPitchState] = useState(1.0);
  const queueRef = useRef<QueueItem[]>([]);
  const isProcessingRef = useRef(false);
  const mountedRef = useRef(true);
  const processNextRef = useRef<() => void>(() => {});

  const isSupported =
    typeof window !== 'undefined' &&
    typeof window.speechSynthesis !== 'undefined';

  /**
   * 加载可用语音列表
   *
   * 首次调用 getVoices() 获取语音，并监听 voiceschanged 事件
   * 以兼容 Chrome 等浏览器的异步加载行为。
   */
  const loadVoices = useCallback(() => {
    if (!isSupported) return;

    const allVoices = window.speechSynthesis.getVoices();
    if (allVoices.length > 0) {
      setVoices(
        allVoices.map((v) => ({
          voiceURI: v.voiceURI,
          name: v.name,
          lang: v.lang,
          localService: v.localService,
        })),
      );
    }
  }, [isSupported]);

  /**
   * 设置激活的语音
   */
  const setVoice = useCallback((voiceURI: string) => {
    // 验证语音 URI 是否有效
    const exists = window.speechSynthesis
      .getVoices()
      .some((v) => v.voiceURI === voiceURI);
    if (exists) {
      setActiveVoiceURI(voiceURI);
    }
  }, []);

  /**
   * 设置语速（0.5-2.0）
   */
  const setRate = useCallback((value: number) => {
    setRateState(Math.max(0.5, Math.min(2.0, value)));
  }, []);

  /**
   * 设置音调（0.5-2.0）
   */
  const setPitch = useCallback((value: number) => {
    setPitchState(Math.max(0.5, Math.min(2.0, value)));
  }, []);

  /**
   * 处理队列中的下一条语音
   *
   * 从队列头部取出文本，创建 utterance 并播报。
   * 应用当前激活的语音、语速和音调设置。
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

    const utterance = new SpeechSynthesisUtterance(item.text);
    // 应用全局设置（可被单次 speak options 覆盖）
    utterance.rate = item.options?.rate ?? rate;
    utterance.pitch = item.options?.pitch ?? pitch;
    utterance.volume = item.options?.volume ?? 1.0;
    utterance.lang = item.options?.lang ?? 'zh-CN';

    // 应用选定的语音
    if (activeVoiceURI) {
      const voice = window.speechSynthesis
        .getVoices()
        .find((v) => v.voiceURI === activeVoiceURI);
      if (voice) {
        utterance.voice = voice;
      }
    }

    utterance.onstart = () => {
      if (mountedRef.current) setState('speaking');
    };

    utterance.onend = () => {
      processNextRef.current();
    };

    utterance.onerror = () => {
      processNextRef.current();
    };

    window.speechSynthesis.speak(utterance);
  }, [activeVoiceURI, rate, pitch]);

  // 保持 ref 指向最新的 processNext
  useEffect(() => {
    processNextRef.current = processNext;
  }, [processNext]);

  /**
   * 播报指定文本（加入队列尾部）
   */
  const speak = useCallback(
    (text: string, options?: TTSVoiceOptions) => {
      if (!isSupported || !text.trim()) return;

      if (queueRef.current.length >= MAX_QUEUE_SIZE) {
        queueRef.current.shift();
      }

      queueRef.current.push({ text, options });

      if (!isProcessingRef.current) {
        processNext();
      }
    },
    [isSupported, processNext],
  );

  /**
   * 批量播报多段文本
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
   * 加载语音列表并监听 voiceschanged 事件
   *
   * 使用 setTimeout 延迟初次加载以避免在 effect 中同步调用 setState。
   * 后续通过 voiceschanged 事件自动刷新语音列表。
   */
  useEffect(() => {
    if (!isSupported) return;

    // 延迟加载以避免同步 setState
    const timer = setTimeout(() => {
      loadVoices();
    }, 0);

    window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
    return () => {
      clearTimeout(timer);
      window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
    };
  }, [isSupported, loadVoices]);

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

  return {
    state,
    isSupported,
    voices,
    activeVoiceURI,
    setVoice,
    rate,
    setRate,
    pitch,
    setPitch,
    speak,
    speakAll,
    stop,
    pause,
    resume,
  };
}
