import { useState, useRef, useCallback, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import CameraView from '@/components/camera/CameraView';
import CameraStatus from '@/components/camera/CameraStatus';
import VolumeMeter from '@/components/shared/VolumeMeter';
import TimerBar from '@/components/interview/TimerBar';
import useCamera from '@/hooks/useCamera';
import useAudioCapture from '@/hooks/useAudioCapture';
import useSTT from '@/hooks/useSTT';
import useTTS from '@/hooks/useTTS';
import useTimer from '@/hooks/useTimer';
import { useVisionMonitor } from '@/hooks/useVisionMonitor';
import useAgent from '@/hooks/useAgent';
import { InterviewAI } from '@/services/interview-ai';
import { createLLMClient } from '@/services/llm';
import { transcribeWithWhisper } from '@/services/stt';
import { getProviderConfig } from '@/config/providers';
import { buildScoringPrompt, parseScoresFromJSON } from '@/utils/scoring';
import type { InterviewScores } from '@/utils/scoring';
import ScorePanel from '@/components/interview/ScorePanel';
import type { ChatMessage, HistoryRecord } from '@/types';
import type { InterviewReport } from '@/types/agent';

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
    resumeFrom?: ChatMessage[];
  } | null;

  const configuredDuration = state?.duration ?? 900;
  const isReviewMode = state?.mode === 'review';
  const isResume = !!state?.resumeFrom?.length;

  // ── Agent 模式开关 ──
  const [agentMode, setAgentMode] = useState<boolean>(() => {
    return localStorage.getItem('ai_interview_agent_mode') === 'true';
  });

  const toggleAgentMode = useCallback(() => {
    setAgentMode((prev) => {
      const next = !prev;
      localStorage.setItem('ai_interview_agent_mode', String(next));
      return next;
    });
  }, []);

  // ── State ──
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isPaused, setIsPaused] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scores, setScores] = useState<InterviewScores | null>(null);
  const [scoring, setScoring] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<number>(Date.now());
  const aiRef = useRef<InterviewAI | null>(null);

  // ── Hooks ──
  const camera = useCamera();
  const audio = useAudioCapture();
  const stt = useSTT({ silenceTimeout: 1500 });
  const tts = useTTS();
  const timer = useTimer(configuredDuration);

  // ── API config（必须在云端 STT 之前定义，因为 transcribeCloud 依赖它们）──
  const apiKey = localStorage.getItem('ai_interview_api_key') || '';
  const providerConfig = getProviderConfig();
  const apiReady = !!apiKey;

  // ── 云端 STT 降级：录音 + Whisper ──
  const [cloudSttLoading, setCloudSttLoading] = useState(false);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // 初始化音频流（用于云端 STT 降级录音）
  useEffect(() => {
    if (!stt.isSupported || stt.needsCloudFallback) {
      navigator.mediaDevices.getUserMedia({ audio: true }).then((s) => {
        audioStreamRef.current = s;
      }).catch(() => {
        console.warn('[STT] 无法获取音频流用于云端降级');
      });
    }
    return () => {
      audioStreamRef.current?.getTracks().forEach((t) => t.stop());
      audioStreamRef.current = null;
    };
  }, [stt.isSupported, stt.needsCloudFallback]);

  // 开始录音
  const startRecording = useCallback(() => {
    const stream = audioStreamRef.current;
    if (!stream) return;
    try {
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
    } catch {
      // MediaRecorder 不支持
    }
  }, []);

  // 停止录音并返回 Blob
  const stopRecording = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
        resolve(null);
        return;
      }
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        resolve(blob.size > 0 ? blob : null);
      };
      recorder.stop();
    });
  }, []);

  // 云端 Whisper 识别（仅 OpenAI 服务商可用）
  const transcribeCloud = useCallback(async (): Promise<string | null> => {
    if (!apiKey) return null;
    if (providerConfig.id !== 'openai' && providerConfig.id !== 'custom') return null;
    const blob = await stopRecording();
    if (!blob) return null;
    setCloudSttLoading(true);
    try {
      const result = await transcribeWithWhisper(blob, {
        apiKey,
        baseUrl: providerConfig.id === 'openai' ? undefined : providerConfig.baseUrl.replace(/\/v1\/?$/, ''),
        language: 'zh',
      });
      return result.text?.trim() || null;
    } catch (err) {
      console.warn('[STT] Whisper 云识别失败:', err instanceof Error ? err.message : err);
      return null;
    } finally {
      setCloudSttLoading(false);
    }
  }, [apiKey, providerConfig, stopRecording]);

  // ── Vision monitor ──
  const onVisionResult = useCallback((msg: ChatMessage) => {
    setMessages((prev) => [...prev, msg]);
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }, []);

  useVisionMonitor({
    intervalSeconds: 20,
    enabled: hasStarted && !isPaused && camera.state === 'active',
    stream: camera.stream,
    apiKey,
    baseUrl: providerConfig.baseUrl,
    model: providerConfig.defaultModel,
    onVisionResult,
  });

  // ── Agent 模式 Hook ──
  const captureFrameForAgent = useCallback((): string | null => {
    if (!camera.stream || camera.state !== 'active') return null;
    try {
      const video = document.querySelector('video');
      if (!video) return null;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(video, 0, 0);
      return canvas.toDataURL('image/jpeg', 0.7);
    } catch {
      return null;
    }
  }, [camera.stream, camera.state]);

  const agent = useAgent({
    apiKey,
    baseUrl: providerConfig.baseUrl,
    model: providerConfig.defaultModel,
    agentConfig: {
      maxIterations: 8,
      visionEnabled: camera.state === 'active',
      followUpDepth: 1,
      maxDuration: configuredDuration,
      mode: state?.mode ?? 'interview',
      resume: state?.resume ?? '',
      jd: state?.jd,
      questions: state?.questions,
      context: state?.context,
      supportsTools: providerConfig.supportsTools,
    },
    onSpeak: (text) => tts.speak(text),
    captureFrame: captureFrameForAgent,
    visionEnabled: camera.state === 'active',
  });

  // ── Init InterviewAI (经典模式) ──
  useEffect(() => {
    if (!apiReady) return;

    const llmClient = createLLMClient({ apiKey, baseUrl: providerConfig.baseUrl, model: providerConfig.defaultModel });
    aiRef.current = new InterviewAI({
      llmClient,
      resume: state?.resume ?? '',
      jd: state?.jd,
      questions: state?.questions,
      context: state?.context,
      mode: state?.mode ?? 'interview',
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-save ──
  useEffect(() => {
    const autoSave = localStorage.getItem('ai_interview_auto_save') === 'true';
    if (!autoSave || messages.length === 0 || !hasStarted) return;
    const interval = setInterval(() => { saveToHistory(true); }, 30000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, hasStarted]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // ── 面试开始后自动开启麦克风，每次 agent 回复后重新开始 ──
  const [sttRestartToken, setSttRestartToken] = useState(0);

  const triggerSttRestart = useCallback(() => {
    setSttRestartToken((t) => t + 1);
  }, []);

  // ── Save（必须在 sendMessage 之前定义）──
  const saveToHistory = useCallback((silent = false, overrideMessages?: ChatMessage[]): string | null => {
    const msgs = overrideMessages ?? messages;
    if (msgs.length === 0) return null;
    const id = `iv_${Date.now()}`;
    const actualDuration = Math.floor((Date.now() - startTimeRef.current) / 1000);

    const interviewMessages = msgs.filter((m) => m.role !== 'system');
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
      transcript: interviewMessages,
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
      return id;
    } catch {
      if (!silent) alert('保存失败');
      return null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, state, configuredDuration, isReviewMode, navigate]);

  // ── Score（必须在 sendMessage 之前定义）──
  const runScoring = useCallback(async (recordId: string) => {
    if (!apiReady) return;
    setScoring(true);

    const interviewMessages = messages
      .filter((m) => m.role !== 'system')
      .map((m) => `${m.role === 'interviewer' ? '面试官' : '候选人'}：${m.text}`)
      .join('\n');

    try {
      const llmClient = createLLMClient({ apiKey, baseUrl: providerConfig.baseUrl, model: providerConfig.defaultModel });
      const prompt = buildScoringPrompt(interviewMessages);
      const result = await llmClient.chat([{ role: 'user', content: prompt }]);
      const parsed = parseScoresFromJSON(result.content);

      if (parsed) {
        setScores(parsed);
        const raw = localStorage.getItem('ai_interview_history');
        if (raw) {
          const history: HistoryRecord[] = JSON.parse(raw);
          const idx = history.findIndex((r) => r.id === recordId);
          if (idx >= 0) {
            history[idx].score = parsed.totalScore;
            history[idx].dimensions = Object.fromEntries(
              parsed.dimensions.map((d) => [d.name, d.score]),
            );
            localStorage.setItem('ai_interview_history', JSON.stringify(history));
          }
        }
      }
    } catch (err) {
      console.error('评分失败:', err);
    } finally {
      setScoring(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, apiReady, apiKey, providerConfig.baseUrl, providerConfig.defaultModel]);

  // ── Send ──
  const inputTextRef = useRef('');
  useEffect(() => { inputTextRef.current = inputText; }, [inputText]);

  const sendMessageRef = useRef<(textOverride?: string) => Promise<void>>(async () => {});

  const sendMessage = useCallback(async (textOverride?: string) => {
    const text = (textOverride ?? inputTextRef.current).trim();
    if (!text || isPaused) return;

    const userText = text;
    setMessages((prev) => [...prev, { role: 'user', text: userText, timestamp: Date.now() }]);
    setInputText('');
    inputTextRef.current = '';
    setTimeout(scrollToBottom, 100);

    // ── Agent 模式 ──
    if (agentMode) {
      try {
        await agent.submitAnswer(userText);
        const agentMsgs = agent.messages;
        setMessages(agentMsgs);
        setTimeout(scrollToBottom, 100);
        triggerSttRestart();

        if (agent.isComplete && agent.finalReport) {
          const report = agent.finalReport;
          setScores({
            dimensions: report.dimensions,
            totalScore: report.totalScore,
            summary: report.summary || '面试完成',
          });
          const recordId = saveToHistory(true, agentMsgs);
          if (recordId) {
            const raw = localStorage.getItem('ai_interview_history');
            if (raw) {
              const history: HistoryRecord[] = JSON.parse(raw);
              const idx = history.findIndex((r) => r.id === recordId);
              if (idx >= 0) {
                history[idx].score = report.totalScore;
                history[idx].dimensions = Object.fromEntries(
                  report.dimensions.map((d) => [d.name, d.score]),
                );
                localStorage.setItem('ai_interview_history', JSON.stringify(history));
              }
            }
          }
        }
      } catch {
        setMessages((prev) => [...prev, { role: 'interviewer', text: '抱歉，Agent 处理出现问题。请稍后重试。', timestamp: Date.now() }]);
      }
      return;
    }

    // 经典模式
    if (!aiRef.current) return;
    try {
      const response = await aiRef.current.processTurn(userText);
      setMessages((prev) => [...prev, { role: 'interviewer', text: response.text, timestamp: Date.now() }]);
      tts.speak(response.text);
      setTimeout(scrollToBottom, 100);
      triggerSttRestart();

      if (response.vision?.suspiciousBehavior) {
        const detail = response.vision?.suspicionDetail || '异常行为检测';
        setMessages((prev) => [...prev, {
          role: 'system', text: `⚠️ ${detail}`, timestamp: Date.now(), systemType: 'alert',
        }]);
      }
      if (response.isComplete) {
        const recordId = saveToHistory(true);
        if (recordId) {
          setTimeout(() => runScoring(recordId), 500);
        }
      }
    } catch {
      setMessages((prev) => [...prev, { role: 'interviewer', text: '抱歉，连接出现问题。请稍后重试。', timestamp: Date.now() }]);
    }
  }, [isPaused, agentMode, agent, saveToHistory, runScoring, tts, triggerSttRestart, scrollToBottom]);

  // 保持 sendMessageRef 同步（供 useEffect 使用，避免循环依赖）
  useEffect(() => { sendMessageRef.current = sendMessage; }, [sendMessage]);

  // ── Start ──
  const handleStart = useCallback(async () => {
    setHasStarted(true);
    startTimeRef.current = Date.now();
    timer.start();

    if (agentMode) {
      try {
        const welcome = await agent.start();
        setMessages(agent.messages);
        tts.speak(welcome);
      } catch {
        setHasStarted(false);
      }
      setTimeout(scrollToBottom, 200);
      return;
    }

    if (!aiRef.current) return;
    let welcome: string;
    if (isResume && state?.resumeFrom) {
      welcome = aiRef.current.resumeFrom(state.resumeFrom);
      setMessages([
        ...state.resumeFrom,
        { role: 'interviewer', text: welcome, timestamp: Date.now() },
      ]);
    } else {
      welcome = aiRef.current.getWelcomeMessage();
      setMessages([{ role: 'interviewer', text: welcome, timestamp: Date.now() }]);
    }
    tts.speak(welcome);
    setTimeout(scrollToBottom, 200);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isResume, timer, tts, agentMode, agent]);

  // ── Pause ──
  const togglePause = useCallback(() => {
    setIsPaused((p) => {
      const next = !p;
      if (next) { timer.pause(); tts.stop(); stt.abort(); }
      else { timer.start(); }
      return next;
    });
  }, [timer, tts, stt]);

  // ── STT: 实时显示 + 自动提交 + 云端降级 ──
  useEffect(() => {
    if (stt.isListening && stt.interimTranscript) {
      setInputText(stt.interimTranscript);
      inputTextRef.current = stt.interimTranscript;
    }
  }, [stt.interimTranscript, stt.isListening]);

  // STT 开始监听 → 同步开始录音
  useEffect(() => {
    if (stt.isListening) {
      startRecording();
    }
  }, [stt.isListening, startRecording]);

  // 语音结束 → 云端降级 → 自动提交
  useEffect(() => {
    if (!stt.transcript || stt.isListening || !hasStarted || isPaused) return;

    const handleTranscript = async () => {
      let finalText = stt.transcript.trim();
      if (!finalText) return;

      // 云端降级：置信度不足 或 浏览器不支持
      if (!stt.isSupported || stt.needsCloudFallback) {
        const cloudText = await transcribeCloud();
        if (cloudText) {
          finalText = cloudText;
        }
      }

      if (finalText) {
        setInputText(finalText);
        inputTextRef.current = finalText;
        setTimeout(() => {
          sendMessageRef.current(finalText);
        }, 600);
      }
    };

    handleTranscript();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stt.transcript, stt.isListening, hasStarted, isPaused]);

  // 面试开始后 / Agent 回复后自动开启麦克风（仅触发一次，不随 stt.state 循环）
  useEffect(() => {
    if (hasStarted && !isPaused) {
      const initMic = async () => {
        try {
          await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch { /* 权限被拒 */ }
        if (stt.state === 'idle' || stt.state === 'error') {
          stt.start();
        }
      };
      const timer = setTimeout(initMic, 300);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasStarted, isPaused, sttRestartToken]);

  // 本地 STT 长时间无语音 → 提示可能被墙（Google 服务不可达）
  const [sttSilentSeconds, setSttSilentSeconds] = useState(0);
  useEffect(() => {
    if (!stt.isListening) {
      setSttSilentSeconds(0);
      return;
    }
    const interval = setInterval(() => {
      setSttSilentSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [stt.isListening]);

  // 超过 8 秒没检测到语音 → 可能被墙，提示用云端
  const sttBlockedByGFW = stt.isListening && sttSilentSeconds > 8 && !stt.interimTranscript;
  // stt.state 变化不再触发自动重启（避免 idle→listening→idle 死循环）

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-0 p-4">
      {/* ================================================================ */}
      {/* 左侧：对话框 + 控制栏 (75%) */}
      {/* ================================================================ */}
      <div className="flex flex-1 flex-col overflow-hidden rounded-2xl bg-white shadow-sm">
        {/* 对话框 / 评分结果 */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {scores ? (
            <ScorePanel
              scores={scores}
              duration={Math.floor((Date.now() - startTimeRef.current) / 1000)}
              questionCount={messages.filter((m) => m.role === 'interviewer' && (m.text.includes('?') || m.text.includes('？'))).length}
              onViewHistory={() => navigate('/history')}
              onClose={() => setScores(null)}
            />
          ) : scoring ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <svg className="mx-auto h-8 w-8 animate-spin text-[#0071e3]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <p className="mt-3 text-[0.9375rem] font-medium text-[#1d1d1f]">正在生成面试评估...</p>
                <p className="mt-1 text-[0.8125rem] text-[#86868b]">AI 正在分析你的回答表现</p>
              </div>
            </div>
          ) : !hasStarted ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <p className="text-[1.125rem] font-semibold tracking-tight text-[#1d1d1f]">
                  准备就绪
                </p>
                <p className="mt-2 text-[0.875rem] text-[#86868b]">
                  {!apiReady
                    ? '请先在设置页配置 API Key'
                    : camera.state !== 'active'
                      ? '请先开启右侧摄像头'
                      : '点击下方按钮开始面试'}
                </p>
                {agentMode && (
                  <p className="mt-2 inline-block rounded-full bg-[#0071e3]/8 px-3 py-1 text-[0.75rem] font-medium text-[#0071e3]">
                    🤖 Agent 模式 — AI 自主规划面试
                  </p>
                )}
                {state?.resume && (
                  <p className="mt-1 text-[0.75rem] text-[#aeaeb2]">
                    简历 {state.resume.length} 字
                    {state?.jd && <> · JD {state.jd.length} 字</>}
                  </p>
                )}
                {isReviewMode && state?.questions && (
                  <p className="mt-1 text-[0.75rem] text-[#aeaeb2]">
                    已解析 {state.questions.length} 个问题
                  </p>
                )}
              </div>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-[#86868b]">
              <p className="text-[0.9375rem]">面试开始...</p>
            </div>
          ) : (
            messages.map((msg, i) => {
              // 系统消息特殊样式
              if (msg.role === 'system') {
                return (
                  <div key={i} className="mb-3 flex justify-center">
                    <div
                      className={`max-w-[85%] rounded-full px-4 py-1.5 text-[0.75rem] font-medium ${
                        msg.systemType === 'alert'
                          ? 'bg-[#ff3b30]/10 text-[#ff3b30]'
                          : 'bg-[#0071e3]/8 text-[#0071e3]'
                      }`}
                    >
                      {msg.text}
                    </div>
                  </div>
                );
              }

              return (
                <div key={i} className={`mb-4 flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <span className={`mb-1 text-[0.6875rem] font-medium ${
                    msg.role === 'user' ? 'text-[#0071e3]' : 'text-[#86868b]'
                  }`}>
                    {msg.role === 'user' ? '🧑 候选人' : '🤖 面试官'}
                  </span>
                  <div
                    className={`max-w-[72%] rounded-2xl px-4 py-2.5 ${
                      msg.role === 'user'
                        ? 'bg-[#0071e3] text-white'
                        : 'bg-[#f5f5f7] text-[#1d1d1f]'
                    }`}
                  >
                    <p className="text-[0.875rem] leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                  </div>
                </div>
              );
            })
          )}
          {/* STT 等待 / GFW 提示 */}
          {hasStarted && !isPaused && stt.state === 'idle' && messages.length > 0 && (
            <div className="mb-3 flex justify-center">
              <div className="rounded-full bg-[#f5f5f7] px-4 py-1.5 text-[0.75rem] text-[#86868b]">
                🎤 点击底部 🎤 按钮开始语音输入
                {providerConfig.id === 'openai' && '（支持云端转写）'}
              </div>
            </div>
          )}
          {hasStarted && !isPaused && sttBlockedByGFW && (
            <div className="mb-3 flex justify-center">
              <div className="rounded-full bg-[#ff9500]/10 px-4 py-1.5 text-[0.75rem] text-[#ff9500]">
                ⚠ 本地语音识别无响应（可能被墙），请点击 🎤 使用云端转写
              </div>
            </div>
          )}

          {/* 实时语音气泡：边说边显示 */}
          {hasStarted && !isPaused && stt.isListening && stt.interimTranscript && (
            <div className="mb-4 flex flex-col items-end">
              <span className="mb-1 text-[0.6875rem] font-medium text-[#0071e3] animate-pulse">
                🎤 实时转写中...
              </span>
              <div className="max-w-[72%] rounded-2xl rounded-br-md px-4 py-2.5 bg-[#0071e3]/20 text-[#0071e3] border border-[#0071e3]/30">
                <p className="text-[0.875rem] leading-relaxed italic">{stt.interimTranscript}</p>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* 底部：计时器 + 按钮 同行；输入区（评分结果展示时隐藏） */}
        {!scores && !scoring && (
        <div className="border-t border-black/5 px-5 py-3">
          {/* 计时器 + 控制按钮 */}
          <div className="mb-3 flex items-center gap-3">
            <div className="flex-1">
              <TimerBar
                remaining={timer.remaining}
                total={configuredDuration}
                isWarning={timer.isWarning}
                isTimeout={timer.isTimeout}
              />
            </div>
            <div className="flex items-center gap-2">
              {!hasStarted ? (
                <button
                  onClick={handleStart}
                  disabled={!apiReady || camera.state !== 'active'}
                  className="apple-btn-primary"
                >
                  开始面试
                </button>
              ) : (
                <>
                  <button
                    onClick={togglePause}
                    className={`apple-btn-secondary !px-3 !py-1.5 text-[0.8125rem] ${
                      isPaused ? '!bg-[#34c759]/10 !text-[#34c759]' : ''
                    }`}
                  >
                    {isPaused ? '▶ 继续' : '⏸ 暂停'}
                  </button>
                  <button
                    onClick={() => saveToHistory(false)}
                    disabled={messages.length === 0 || saving}
                    className="apple-btn-secondary !px-3 !py-1.5 text-[0.8125rem] disabled:opacity-50"
                  >
                    {saving ? '...' : '💾 保存'}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* STT 状态提示 */}
          {hasStarted && (
            <div className={`mb-2 rounded-lg px-3 py-1.5 text-[0.75rem] ${
              sttBlockedByGFW
                ? 'bg-[#ff9500]/10 text-[#ff9500]'
                : stt.state === 'listening'
                  ? 'bg-[#34c759]/10 text-[#34c759]'
                  : stt.state === 'error'
                    ? 'bg-[#ff3b30]/10 text-[#ff3b30]'
                    : stt.state === 'unsupported'
                      ? 'bg-[#ff3b30]/10 text-[#ff3b30]'
                      : 'bg-[#86868b]/10 text-[#86868b]'
            }`}>
              {sttBlockedByGFW && '⚠ 语音检测超时。中国地区 Chrome 语音识别依赖 Google 服务可能被墙，请使用下方 🎤 录音替代'}
              {!sttBlockedByGFW && stt.state === 'listening' && '🎤 正在聆听... 请说话'}
              {!sttBlockedByGFW && stt.state === 'idle' && '⏸ 点击 🎤 开始语音输入'}
              {!sttBlockedByGFW && stt.state === 'error' && (stt.error || '语音识别出错')}
              {!sttBlockedByGFW && stt.state === 'unsupported' && '✗ 浏览器不支持语音识别'}
            </div>
          )}
          {cloudSttLoading && (
            <div className="mb-2 rounded-lg bg-[#0071e3]/8 px-3 py-1.5 text-[0.75rem] text-[#0071e3]">
              ☁ 正在云端转写语音...
            </div>
          )}

          {/* 输入行 */}
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                // 如果在录音中 → 停止并转写
                if (mediaRecorderRef.current?.state === 'recording') {
                  const blob = await stopRecording();
                  if (blob && apiKey && providerConfig.id === 'openai') {
                    setCloudSttLoading(true);
                    try {
                      const r = await transcribeWithWhisper(blob, { apiKey, language: 'zh' });
                      if (r.text?.trim()) {
                        setInputText(r.text.trim());
                        inputTextRef.current = r.text.trim();
                        setTimeout(() => sendMessageRef.current(r.text.trim()), 600);
                      }
                    } catch {} finally { setCloudSttLoading(false); }
                  }
                  return;
                }
                // 如果在本地STT聆听中 → 停止
                if (stt.isListening) {
                  stt.stop();
                  return;
                }
                // 开启语音输入：优先本地STT，同时开启录音作备份
                try { await navigator.mediaDevices.getUserMedia({ audio: true }); } catch {}
                if (stt.isSupported) stt.start();
                if (providerConfig.id === 'openai') startRecording();
              }}
              disabled={!hasStarted || isPaused || (agentMode && agent.isProcessing)}
              className={`apple-btn-secondary !px-3 !py-2 text-[0.8125rem] disabled:opacity-40 ${
                (stt.isListening || mediaRecorderRef.current?.state === 'recording')
                  ? '!bg-[#ff3b30]/10 !text-[#ff3b30]' : ''
              }`}
              title="点击开始语音输入，再次点击停止"
            >
              {cloudSttLoading ? '☁' :
               mediaRecorderRef.current?.state === 'recording' ? '⏺' :
               stt.isListening ? '⏹' : '🎤'}
            </button>
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
              placeholder={
                !hasStarted
                  ? '开始面试后可输入...'
                  : isPaused
                    ? '面试已暂停...'
                    : agentMode && agent.isProcessing
                      ? 'Agent 正在思考...'
                      : '输入回答...'
              }
              disabled={!hasStarted || isPaused || (agentMode && agent.isProcessing)}
              className="apple-input flex-1 disabled:bg-[#f5f5f7] disabled:opacity-60"
            />
            <button
              onClick={sendMessage}
              disabled={!hasStarted || !inputText.trim() || isPaused || (agentMode && agent.isProcessing)}
              className="apple-btn-primary !px-4 !py-2"
            >
              {agentMode && agent.isProcessing ? '...' : '发送'}
            </button>
          </div>
        </div>
        )}

      </div>

      {/* ================================================================ */}
      {/* 右侧：视频面板 (25%，固定右上角) */}
      {/* ================================================================ */}
      <div className="flex w-72 flex-shrink-0 flex-col gap-2">
        <div className="overflow-hidden rounded-2xl bg-black shadow-sm">
          <div className="flex items-center justify-between bg-[#1d1d1f]/90 px-3 py-1.5">
            <span className="text-[0.6875rem] font-medium tracking-tight text-white/80">
              摄像头
            </span>
            <div className="flex items-center gap-2">
              <VolumeMeter level={audio.volumeLevel} isActive={audio.state === 'active'} />
            </div>
          </div>
          {camera.state === 'active' && camera.stream ? (
            <CameraView stream={camera.stream} mirrored className="aspect-[4/3] w-full" />
          ) : (
            <div className="flex aspect-[4/3] w-full items-center justify-center bg-gray-900">
              {camera.state === 'idle' && (
                <button
                  onClick={() => camera.start()}
                  className="rounded-xl bg-[#0071e3] px-5 py-2 text-[0.8125rem] font-medium text-white hover:bg-[#0077ed] transition-colors"
                >
                  开启摄像头
                </button>
              )}
              {camera.state === 'requesting' && (
                <span className="text-[0.8125rem] text-gray-400">请求权限中...</span>
              )}
            </div>
          )}
        </div>
        <CameraStatus
          state={camera.state}
          error={camera.error}
          onRetry={() => camera.start()}
        />
        {/* 音频状态 */}
        <div className="rounded-2xl bg-white/60 px-3 py-2 shadow-sm">
          <div className="flex items-center justify-between text-[0.75rem]">
            <span className="text-[#86868b]">麦克风</span>
            {audio.state === 'active' ? (
              <span className="font-medium text-[#34c759]">🟢 已开启</span>
            ) : audio.state === 'requesting' ? (
              <span className="text-[#ff9500]">⏳ 请求中...</span>
            ) : audio.state === 'error' ? (
              <button
                onClick={() => audio.start()}
                className="rounded-lg bg-[#ff3b30]/10 px-2 py-0.5 text-[0.6875rem] font-medium text-[#ff3b30]"
              >
                🔴 重试
              </button>
            ) : (
              <button
                onClick={() => audio.start()}
                className="rounded-lg bg-[#0071e3]/10 px-2 py-0.5 text-[0.6875rem] font-medium text-[#0071e3]"
              >
                ⚪ 点击开启
              </button>
            )}
          </div>
          {audio.state === 'active' && (
            <div className="mt-1 flex items-center gap-1 text-[0.6875rem] text-[#86868b]">
              <VolumeMeter level={audio.volumeLevel} isActive={true} />
              <span>音量监测中</span>
            </div>
          )}
        </div>

        {/* Agent 模式开关 */}
        <div className="rounded-2xl bg-white/60 px-3 py-2 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[0.75rem] text-[#86868b]">Agent 模式</span>
            <button
              onClick={toggleAgentMode}
              disabled={hasStarted}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-40 ${
                agentMode ? 'bg-[#0071e3]' : 'bg-[#aeaeb2]'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
                  agentMode ? 'translate-x-[18px]' : 'translate-x-[3px]'
                }`}
              />
            </button>
          </div>
          {agentMode && hasStarted && (
            <div className="mt-1.5 flex items-center gap-1.5 text-[0.6875rem] text-[#0071e3]">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#0071e3] animate-pulse" />
              {agent.agentState === 'planning' || agent.agentState === 'acting'
                ? 'Agent 思考中...'
                : agent.agentState === 'waiting_for_user'
                  ? '等待你的回答'
                  : agent.agentState === 'done'
                    ? '面试完成'
                    : 'Agent 就绪'}
            </div>
          )}
          {agentMode && !hasStarted && (
            <p className="mt-1 text-[0.6875rem] text-[#86868b]">
              Agent 自主决策 · 工具调用
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
