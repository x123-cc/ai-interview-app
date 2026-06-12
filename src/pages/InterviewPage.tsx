import { useState, useRef, useCallback } from 'react';
import CameraView from '@/components/camera/CameraView';
import CameraStatus from '@/components/camera/CameraStatus';
import VolumeMeter from '@/components/shared/VolumeMeter';
import TimerBar from '@/components/interview/TimerBar';
import useCamera from '@/hooks/useCamera';
import useAudioCapture from '@/hooks/useAudioCapture';
import useSTT from '@/hooks/useSTT';
import useTTS from '@/hooks/useTTS';
import useTimer from '@/hooks/useTimer';

interface ChatMessage {
  role: 'interviewer' | 'user';
  text: string;
  timestamp: number;
}

export default function InterviewPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const camera = useCamera();
  const audio = useAudioCapture();
  const stt = useSTT({ silenceTimeout: 1500 });
  const tts = useTTS();
  const timer = useTimer(120);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const addMessage = useCallback(
    (role: 'interviewer' | 'user', text: string) => {
      setMessages((prev) => [...prev, { role, text, timestamp: Date.now() }]);
      setTimeout(scrollToBottom, 100);
    },
    [],
  );

  const startInterview = useCallback(async () => {
    await audio.start();
    timer.start();
    const welcome = '欢迎参加模拟面试！请先做一个简单的自我介绍。';
    addMessage('interviewer', welcome);
    tts.speak(welcome);
  }, [audio, timer, tts, addMessage]);

  const sendMessage = useCallback(() => {
    if (!inputText.trim()) return;
    addMessage('user', inputText.trim());
    setInputText('');
    setTimeout(() => {
      const reply = '这是一个很好的回答，请继续说明其中涉及的关键技术点。';
      addMessage('interviewer', reply);
      tts.speak(reply);
    }, 1000);
  }, [inputText, addMessage, tts]);

  return (
    <div className="flex h-[calc(100vh-8rem)] p-4">
      <div className="flex flex-1 flex-col rounded-lg border border-gray-200 bg-white">
        {/* 顶部状态栏：音量 + 语音状态 + 计时器 */}
        <div className="border-b border-gray-200 px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="font-medium text-gray-900">模拟面试中</span>
            <div className="flex items-center gap-4">
              <VolumeMeter level={audio.volumeLevel} isActive={audio.state === 'active'} />
              <span className="text-sm text-gray-500">
                {stt.isListening ? '🎤 正在听...' : '点击开始'}
              </span>
            </div>
          </div>
          <div className="mt-2">
            <TimerBar remaining={timer.remaining} total={120} isWarning={timer.isWarning} isTimeout={timer.isTimeout} />
          </div>
        </div>

        {/* 对话消息列表 */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-gray-400">
              <div className="text-center">
                <p className="text-lg">准备开始面试</p>
                <button onClick={startInterview} className="mt-4 rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700">
                  开始面试
                </button>
              </div>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div key={i} className={`mb-4 flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[70%] rounded-lg px-4 py-2 ${msg.role === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-900'}`}>
                  <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* 底部输入区：语音按钮 + 文本输入 + 发送 */}
        <div className="border-t border-gray-200 px-4 py-3">
          <div className="flex gap-2">
            <button
              onClick={() => stt.isListening ? stt.stop() : stt.start()}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${stt.isListening ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              {stt.isListening ? '⏹ 停止' : '🎤 语音'}
            </button>
            <input type="text" value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
              placeholder="输入回答..." className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
            <button onClick={sendMessage} disabled={!inputText.trim()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">发送</button>
          </div>
        </div>
      </div>

      {/* 右侧：摄像头面板 */}
      <div className="ml-4 flex w-64 flex-col gap-2">
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-black">
          <CameraView stream={camera.stream} mirrored className="aspect-[4/3]" />
        </div>
        <CameraStatus state={camera.state} error={camera.error} onRetry={() => camera.start()} />
        {camera.state === 'idle' && (
          <button onClick={() => camera.start()} className="rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700">
            开启摄像头
          </button>
        )}
      </div>
    </div>
  );
}
