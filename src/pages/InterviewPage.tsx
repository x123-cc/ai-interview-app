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

  // ── API config ──
  const apiKey = localStorage.getItem('ai_interview_api_key') || '';
  const providerConfig = getProviderConfig();
  const apiReady = !!apiKey;

  // ── Vision monitor ──
  const onVisionResult = useCallback((msg: ChatMessage) => {
    setMessages((prev) => [...prev, msg]);
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }, []);

  useVisionMonitor({
    intervalSeconds: 20,
    enabled: hasStarted && !isPaused && camera.state === 'active' && !agentMode,
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
    },
    onSpeak: (text) => tts.speak(text),
    captureFrame: captureFrameForAgent,
    visionEnabled: camera.state === 'active',
  });

  // ── Init InterviewAI (经典模式) ──
  useEffect(() => {
    if (!apiReady) return;

    const llmClient = createLLMClient({ apiKey, baseUrl: providerConfig.baseUrl });
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

  // ── Start ──
  const handleStart = useCallback(async () => {
    setHasStarted(true);
    startTimeRef.current = Date.now();
    timer.start();

    if (agentMode) {
      // Agent 模式
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

    // 经典模式
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

  // ── Send ──
  const sendMessage = useCallback(async () => {
    if (!inputText.trim() || isPaused) return;

    const userText = inputText.trim();
    setMessages((prev) => [...prev, { role: 'user', text: userText, timestamp: Date.now() }]);
    setInputText('');
    setTimeout(scrollToBottom, 100);

    // ── Agent 模式 ──
    if (agentMode) {
      try {
        await agent.submitAnswer(userText);
        const agentMsgs = agent.messages;
        setMessages(agentMsgs);
        setTimeout(scrollToBottom, 100);

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

    try {
      const response = await aiRef.current.processTurn(userText);
      setMessages((prev) => [...prev, { role: 'interviewer', text: response.text, timestamp: Date.now() }]);
      tts.speak(response.text);
      setTimeout(scrollToBottom, 100);

      if (response.vision?.suspiciousBehavior) {
        const detail = response.vision?.suspicionDetail || '异常行为检测';
        setMessages((prev) => [...prev, {
          role: 'system', text: `⚠️ ${detail}`, timestamp: Date.now(), systemType: 'alert',
        }]);
      }
      if (response.isComplete) {
        const recordId = saveToHistory(true); // 静默保存
        if (recordId) {
          setTimeout(() => runScoring(recordId), 500);
        }
      }
    } catch {
      setMessages((prev) => [...prev, { role: 'interviewer', text: '抱歉，连接出现问题。请稍后重试。', timestamp: Date.now() }]);
    }
  }, [inputText, isPaused, tts]);

  // ── Pause ──
  const togglePause = useCallback(() => {
    setIsPaused((p) => {
      const next = !p;
      if (next) { timer.pause(); tts.stop(); stt.abort(); }
      else { timer.start(); }
      return next;
    });
  }, [timer, tts, stt]);

  // ── Save ──
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

  // ── Score (仅完整面试) ──
  const runScoring = useCallback(async (recordId: string) => {
    if (!apiReady) return;
    setScoring(true);

    const interviewMessages = messages
      .filter((m) => m.role !== 'system')
      .map((m) => `${m.role === 'interviewer' ? '面试官' : '候选人'}：${m.text}`)
      .join('\n');

    try {
      const llmClient = createLLMClient({ apiKey, baseUrl: providerConfig.baseUrl });
      const prompt = buildScoringPrompt(interviewMessages);
      const result = await llmClient.chat([{ role: 'user', content: prompt }]);
      const parsed = parseScoresFromJSON(result.content);

      if (parsed) {
        setScores(parsed);
        // 更新 localStorage 中的记录
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
  }, [messages, apiReady, apiKey, providerConfig.baseUrl]);

  // ── STT auto-fill ──
  useEffect(() => {
    if (stt.transcript && !stt.isListening) {
      setInputText((prev) => prev + stt.transcript);
    }
  }, [stt.transcript, stt.isListening]);

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
                <div key={i} className={`mb-4 flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
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

          {/* 输入行 */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => (stt.isListening ? stt.stop() : stt.start())}
              disabled={!hasStarted || isPaused || (agentMode && agent.isProcessing)}
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
          <div className="flex items-center justify-between text-[0.75rem] text-[#86868b]">
            <span>麦克风</span>
            <span>{audio.state === 'active' ? '🟢 已开启' : '⚪ 未开启'}</span>
          </div>
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
