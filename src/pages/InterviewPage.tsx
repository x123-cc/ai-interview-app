import { useState, useRef, useCallback, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import FloatingCamera from '@/components/interview/FloatingCamera';
import VolumeMeter from '@/components/shared/VolumeMeter';
import TimerBar from '@/components/interview/TimerBar';
import useCamera from '@/hooks/useCamera';
import useAudioCapture from '@/hooks/useAudioCapture';
import useSTT from '@/hooks/useSTT';
import useTTS from '@/hooks/useTTS';
import useTimer from '@/hooks/useTimer';
import { InterviewAI } from '@/services/interview-ai';
import type { VisionAnalysis } from '@/services/interview-ai';
import { createLLMClient } from '@/services/llm';
import { getProviderConfig } from '@/config/providers';
import type { ChatMessage, HistoryRecord } from '@/types';

/** 从 camera stream 中抓取一帧 base64 */
function captureFrame(stream: MediaStream): Promise<string | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.srcObject = stream;
    video.playsInline = true;
    video.muted = true;
    video.play().then(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 240;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(null); return; }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const base64 = canvas.toDataURL('image/jpeg', 0.5);
      video.pause();
      video.srcObject = null;
      resolve(base64);
    }).catch(() => resolve(null));
  });
}

export default function InterviewPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as {
    mode?: 'interview' | 'review';
    resume?: string;
    jd?: string;
    questions?: string[];
    context?: string;
    duration?: number;
    /** 继续面试：已有的逐字稿 */
    resumeFrom?: ChatMessage[];
  } | null;

  const configuredDuration = state?.duration ?? 900;
  const isReviewMode = state?.mode === 'review';
  const isResume = !!state?.resumeFrom?.length;

  // ── State ──
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [cameraExpanded, setCameraExpanded] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [saving, setSaving] = useState(false);
  const [vision, setVision] = useState<VisionAnalysis | null>(null);
  const [apiReady, setApiReady] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<number>(Date.now());
  const timerStartedRef = useRef(false);
  const aiRef = useRef<InterviewAI | null>(null);
  const msgCounterRef = useRef(0);

  // ── Hooks ──
  const camera = useCamera();
  const audio = useAudioCapture();
  const stt = useSTT({ silenceTimeout: 1500 });
  const tts = useTTS();
  const timer = useTimer(configuredDuration);

  // ── Init InterviewAI ──
  useEffect(() => {
    const apiKey = localStorage.getItem('ai_interview_api_key') || '';
    if (!apiKey) {
      setApiReady(false);
      return;
    }
    setApiReady(true);

    const providerConfig = getProviderConfig();
    const llmClient = createLLMClient({ apiKey, baseUrl: providerConfig.baseUrl });

    aiRef.current = new InterviewAI({
      llmClient,
      resume: state?.resume ?? '',
      jd: state?.jd,
      questions: state?.questions,
      context: state?.context,
      mode: state?.mode ?? 'interview',
    });

    // 继续面试 or 新面试
    if (isResume && state?.resumeFrom) {
      const resumeText = aiRef.current.resumeFrom(state.resumeFrom);
      setMessages([
        ...state.resumeFrom,
        { role: 'interviewer' as const, text: resumeText, timestamp: Date.now() },
      ]);
      tts.speak(resumeText);
      // 继续时计时器直接启动
      timerStartedRef.current = true;
      timer.start();
    } else {
      const welcome = aiRef.current.getWelcomeMessage();
      setMessages([{
        role: 'interviewer',
        text: welcome,
        timestamp: Date.now(),
      }]);
      tts.speak(welcome);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 自动保存 ──
  useEffect(() => {
    const autoSave = localStorage.getItem('ai_interview_auto_save') === 'true';
    if (!autoSave || messages.length === 0) return;
    const interval = setInterval(() => { saveToHistory(true); }, 30000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const addMessage = useCallback((role: 'interviewer' | 'user', text: string) => {
    setMessages((prev) => [...prev, { role, text, timestamp: Date.now() }]);
    setTimeout(scrollToBottom, 100);
  }, []);

  // ── Send message with vision ──
  const sendMessage = useCallback(async () => {
    if (!inputText.trim() || isPaused) return;
    const userText = inputText.trim();
    addMessage('user', userText);
    setInputText('');

    // First message starts timer
    if (!timerStartedRef.current) {
      timerStartedRef.current = true;
      startTimeRef.current = Date.now();
      timer.start();
    }

    // 成本控制：每 3 条消息发送一次摄像头画面给 AI 分析
    msgCounterRef.current += 1;
    const shouldSendImage = msgCounterRef.current % 3 === 0 && camera.stream;

    let imageBase64: string | undefined;
    if (shouldSendImage) {
      imageBase64 = (await captureFrame(camera.stream!)) ?? undefined;
    }

    const ai = aiRef.current;
    if (!ai) {
      // 无 API Key 时的降级回复
      setTimeout(() => {
        addMessage('interviewer', '请先在设置页面配置 API Key 以启用 AI 面试功能。');
      }, 800);
      return;
    }

    try {
      const response = await ai.processTurn(userText, imageBase64);

      addMessage('interviewer', response.text);
      tts.speak(response.text);

      // 更新视觉分析
      if (response.vision) {
        setVision(response.vision);
        // 作弊嫌疑 → 额外提醒
        if (response.vision.suspiciousBehavior) {
          addMessage('interviewer',
            `⚠️ 系统提醒：${response.vision.suspicionDetail || '请保持面对屏幕'}`);
        }
        // 10 秒后清除视觉状态
        setTimeout(() => setVision(null), 10000);
      }

      // 面试完成
      if (response.isComplete) {
        setTimeout(() => saveToHistory(false), 2000);
      }
    } catch (err) {
      console.error('AI 回复失败:', err);
      addMessage('interviewer', '抱歉，连接出现问题。请稍后重试。');
    }
  }, [inputText, isPaused, addMessage, camera.stream, tts, timer]);

  // ── Pause / Resume ──
  const togglePause = useCallback(() => {
    setIsPaused((p) => {
      const next = !p;
      if (next) { timer.pause(); tts.stop(); stt.abort(); }
      else { timer.start(); }
      return next;
    });
  }, [timer, tts, stt]);

  // ── Save ──
  const saveToHistory = useCallback((silent = false) => {
    if (messages.length === 0) return;
    const id = `iv_${Date.now()}`;
    const actualDuration = Math.floor((Date.now() - startTimeRef.current) / 1000);
    const record: HistoryRecord = {
      id,
      date: new Date().toISOString(),
      title: `${isReviewMode ? '复盘' : '模拟'}面试 · ${new Date().toLocaleDateString('zh-CN')}`,
      mode: state?.mode ?? 'interview',
      duration: actualDuration,
      setDuration: configuredDuration,
      resume: state?.resume,
      jd: state?.jd,
      questions: state?.questions,
      transcript: messages,
    };

    try {
      const raw = localStorage.getItem('ai_interview_history');
      const history: HistoryRecord[] = raw ? JSON.parse(raw) : [];
      history.unshift(record);
      localStorage.setItem('ai_interview_history', JSON.stringify(history));

      if (!silent) {
        setSaving(true);
        setTimeout(() => { setSaving(false); navigate('/history'); }, 600);
      }
    } catch (err) {
      console.error('保存失败:', err);
      if (!silent) alert('保存失败');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, state, configuredDuration, isReviewMode, navigate]);

  // ── STT → 自动填入输入框 ──
  useEffect(() => {
    if (stt.transcript && !stt.isListening) {
      setInputText((prev) => prev + stt.transcript);
    }
  }, [stt.transcript, stt.isListening]);

  // ── Emotion indicator ──
  const emotionLabel: Record<string, string> = {
    calm: '😌 平静',
    nervous: '😰 紧张',
    confident: '😊 自信',
    uncertain: '🤔 犹豫',
    neutral: '😐 自然',
  };

  // ── Chat Area ──
  const chatArea = (
    <div className="flex flex-1 flex-col apple-card overflow-hidden">
      {/* Header */}
      <div className="border-b border-black/5 px-5 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-[0.9375rem] font-semibold tracking-tight text-[#1d1d1f]">
              {isReviewMode ? '复盘面试中' : '模拟面试中'}
            </span>
            {isPaused && (
              <span className="rounded-full bg-[#ff9500]/10 px-2.5 py-0.5 text-[0.6875rem] font-medium text-[#ff9500]">
                已暂停
              </span>
            )}
            {!apiReady && (
              <span className="rounded-full bg-[#ff3b30]/10 px-2.5 py-0.5 text-[0.6875rem] font-medium text-[#ff3b30]">
                未配置 API
              </span>
            )}
            {vision && (
              <div className="flex items-center gap-2 rounded-full bg-black/5 px-2.5 py-0.5 text-[0.6875rem]">
                {vision.suspiciousBehavior ? (
                  <span className="font-medium text-[#ff3b30]">⚠ 异常行为</span>
                ) : (
                  <span className="text-[#86868b]">
                    {emotionLabel[vision.emotion] || vision.emotion}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <VolumeMeter level={audio.volumeLevel} isActive={audio.state === 'active'} />
            <span className="text-[0.8125rem] text-[#86868b]">
              {stt.isListening ? '🎤 正在听...' : '点击开始'}
            </span>
          </div>
        </div>
        <div className="mt-2">
          <TimerBar remaining={timer.remaining} total={configuredDuration} isWarning={timer.isWarning} isTimeout={timer.isTimeout} />
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {messages.map((msg, i) => (
          <div key={i} className={`mb-4 flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[72%] rounded-2xl px-4 py-2.5 ${
                msg.role === 'user' ? 'bg-[#0071e3] text-white' : 'bg-[#f5f5f7] text-[#1d1d1f]'
              }`}
            >
              <p className="text-[0.875rem] leading-relaxed whitespace-pre-wrap">{msg.text}</p>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-black/5 px-5 py-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => (stt.isListening ? stt.stop() : stt.start())}
            disabled={isPaused}
            className={`apple-btn-secondary !px-3 !py-2 text-[0.8125rem] disabled:opacity-40 ${
              stt.isListening ? '!bg-[#ff3b30]/10 !text-[#ff3b30]' : ''
            }`}
          >
            {stt.isListening ? '⏹' : '🎤'}
          </button>

          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            placeholder={isPaused ? '面试已暂停...' : apiReady ? '输入回答...' : '请先在设置页配置 API Key'}
            disabled={isPaused}
            className="apple-input flex-1 disabled:bg-[#f5f5f7] disabled:opacity-60"
          />

          <button onClick={sendMessage} disabled={!inputText.trim() || isPaused} className="apple-btn-primary !px-4 !py-2">
            发送
          </button>

          <div className="mx-1 h-5 w-px bg-black/10" />

          <button
            onClick={togglePause}
            className={`apple-btn-secondary !px-3 !py-2 text-[0.8125rem] ${isPaused ? '!bg-[#34c759]/10 !text-[#34c759]' : ''}`}
          >
            {isPaused ? '▶' : '⏸'}
          </button>

          <button
            onClick={() => saveToHistory(false)}
            disabled={messages.length === 0 || saving}
            className="apple-btn-secondary !px-3 !py-2 text-[0.8125rem]"
          >
            {saving ? '...' : '💾'}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col p-4">
      {cameraExpanded && (
        <div className="mb-4 flex-shrink-0">
          <FloatingCamera stream={camera.stream} cameraState={camera.state} cameraError={camera.error}
            onRetry={() => camera.start()} onStart={() => camera.start()}
            expanded onExpandToggle={() => setCameraExpanded(false)} />
        </div>
      )}
      {chatArea}
      {!cameraExpanded && (
        <FloatingCamera stream={camera.stream} cameraState={camera.state} cameraError={camera.error}
          onRetry={() => camera.start()} onStart={() => camera.start()}
          expanded={false} onExpandToggle={() => setCameraExpanded(true)} />
      )}
    </div>
  );
}
