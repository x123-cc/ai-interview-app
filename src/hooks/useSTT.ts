import { useState, useRef, useCallback, useEffect } from 'react';
import type { STTState, UseSTTOptions, UseSTTReturn } from '@/types';

/**
 * 获取浏览器 SpeechRecognition 构造函数
 *
 * 兼容 Chrome/Safari/Edge 等浏览器的前缀差异。
 * 返回 undefined 表示当前环境不支持语音识别。
 */
function getRecognitionConstructor():
  | (new () => SpeechRecognition)
  | undefined {
  if (typeof SpeechRecognition !== 'undefined') {
    return SpeechRecognition;
  }
  if (typeof webkitSpeechRecognition !== 'undefined') {
    return webkitSpeechRecognition;
  }
  return undefined;
}

/**
 * 语音识别 Hook（STT — Speech to Text）
 *
 * 封装浏览器原生 Web Speech API（SpeechRecognition），
 * 提供语音识别状态管理、文本累积和资源释放。
 * 组件卸载时自动停止识别。
 *
 * @param options - 识别配置选项
 * @returns 识别状态、文本和控制方法
 */
export default function useSTT(options: UseSTTOptions = {}): UseSTTReturn {
  const { lang = 'zh-CN', continuous = false, silenceTimeout = 1500 } = options;

  const [state, setState] = useState<STTState>(() => {
    return getRecognitionConstructor() ? 'idle' : 'unsupported';
  });
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  // 是否正在监听中（用于内部状态追踪）
  const isListeningRef = useRef(false);
  // 已累积的最终文本（跨多次识别累积）
  const accumulatedRef = useRef('');
  // 组件是否已卸载
  const mountedRef = useRef(true);
  // 静默超时计时器
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isSupported = state !== 'unsupported';

  /**
   * 获取中文错误提示
   */
  function getErrorMessage(errorCode: string): string {
    switch (errorCode) {
      case 'not-allowed':
        return '麦克风权限被拒绝，请在浏览器设置中允许访问';
      case 'audio-capture':
        return '未检测到麦克风设备';
      case 'network':
        return '网络连接异常，语音识别需要网络支持';
      case 'aborted':
        return '语音识别被中断';
      default:
        return `语音识别发生错误：${errorCode}`;
    }
  }

  /**
   * 创建 SpeechRecognition 实例
   */
  const createRecognition = useCallback((): SpeechRecognition | null => {
    const Constructor = getRecognitionConstructor();
    if (!Constructor) {
      setState('unsupported');
      return null;
    }

    const recognition = new Constructor();
    recognition.lang = lang;
    recognition.continuous = continuous;
    recognition.interimResults = true;

    /**
     * 识别结果回调
     * 同时处理中间结果（isFinal=false）和最终结果（isFinal=true）
     */
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      let finalText = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        // 取第一个（最佳）替代结果
        const alternative = result[0];
        if (result.isFinal) {
          finalText += alternative.transcript;
        } else {
          interim += alternative.transcript;
        }
      }

      // 累积最终文本
      if (finalText) {
        accumulatedRef.current += finalText;
        if (mountedRef.current) {
          setTranscript(accumulatedRef.current);
          setInterimTranscript('');
        }
      }

      // 更新中间结果
      if (mountedRef.current) {
        setInterimTranscript(interim);
      }
    };

    /**
     * 静默超时：清除计时器
     */
    const clearSilenceTimer = () => {
      if (silenceTimerRef.current !== null) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
    };

    /**
     * 语音开始回调：重置静默计时器
     */
    recognition.onspeechstart = () => {
      clearSilenceTimer();
    };

    /**
     * 语音结束回调：启动静默计时器，超时后自动停止
     */
    recognition.onspeechend = () => {
      clearSilenceTimer();
      silenceTimerRef.current = setTimeout(() => {
        if (mountedRef.current && isListeningRef.current) {
          isListeningRef.current = false;
          recognition.stop();
          setState('idle');
        }
      }, silenceTimeout);
    };

    /**
     * 错误回调
     * no-speech 视为正常静默，其他错误记录并展示
     */
    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'no-speech') return;

      if (mountedRef.current) {
        setError(getErrorMessage(event.error));
        setState('error');
      }
    };

    /**
     * 识别结束回调
     * 自动重新开始以保持连续监听
     */
    recognition.onend = () => {
      if (!mountedRef.current) return;

      // 如果仍在监听中（非手动停止），自动重新开始
      if (isListeningRef.current) {
        try {
          recognition.start();
        } catch {
          // 已经启动则忽略
        }
        return;
      }

      // 手动停止或出错
      if (mountedRef.current) {
        setState('idle');
      }
    };

    return recognition;
  }, [lang, continuous, silenceTimeout]);

  /**
   * 开始监听语音
   */
  const start = useCallback(() => {
    if (!isSupported) return;

    // 如果已有实例在运行，先停止
    if (recognitionRef.current) {
      recognitionRef.current.abort();
    }

    const recognition = createRecognition();
    if (!recognition) return;

    recognitionRef.current = recognition;
    accumulatedRef.current = '';
    isListeningRef.current = true;

    if (mountedRef.current) {
      setTranscript('');
      setInterimTranscript('');
      setError(null);
      setState('listening');
    }

    try {
      recognition.start();
    } catch {
      if (mountedRef.current) {
        setError('启动语音识别失败，请刷新页面后重试');
        setState('error');
      }
    }
  }, [isSupported, createRecognition]);

  /**
   * 停止监听并返回已识别文本
   */
  const stop = useCallback(() => {
    isListeningRef.current = false;
    if (silenceTimerRef.current !== null) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    if (mountedRef.current) {
      setState('idle');
    }
  }, []);

  /**
   * 取消监听并丢弃当前结果
   */
  const abort = useCallback(() => {
    isListeningRef.current = false;
    if (silenceTimerRef.current !== null) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (recognitionRef.current) {
      recognitionRef.current.abort();
    }
    if (mountedRef.current) {
      accumulatedRef.current = '';
      setTranscript('');
      setInterimTranscript('');
      setState('idle');
      setError(null);
    }
  }, []);

  /**
   * 组件卸载时自动停止识别
   */
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      isListeningRef.current = false;
      if (silenceTimerRef.current !== null) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  return {
    state,
    transcript,
    interimTranscript,
    isListening: state === 'listening',
    error,
    isSupported,
    start,
    stop,
    abort,
  };
}
