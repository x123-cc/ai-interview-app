import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';
import type { InterviewMode, ReviewSourceType } from '@/types';
import { parseReviewFileContent, extractQuestions } from '@/services/review-parser';
import { createLLMClient } from '@/services/llm';
import { getProviderConfig } from '@/config/providers';

// 配置 PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString();

type FileStatus = 'idle' | 'loading' | 'success' | 'error';

export default function HomePage() {
  const navigate = useNavigate();

  // ========== 通用状态 ==========
  const [mode, setMode] = useState<InterviewMode>('interview');
  const [duration, setDuration] = useState(900); // 面试时长（秒），默认 15 分钟
  const [apiPromptDismissed, setApiPromptDismissed] = useState(false);
  const hasApiKey = (localStorage.getItem('ai_interview_api_key') || '').length > 0;

  // ========== 面试模式状态 ==========
  const [resumeText, setResumeText] = useState('');
  const [jdText, setJdText] = useState('');
  const [fileStatus, setFileStatus] = useState<FileStatus>('idle');
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ========== 复盘模式状态 ==========
  const [reviewSource, setReviewSource] = useState<ReviewSourceType>('text');
  const [reviewFile, setReviewFile] = useState<File | null>(null);
  const [reviewText, setReviewText] = useState('');
  const [reviewFileStatus, setReviewFileStatus] = useState<FileStatus>('idle');
  const [reviewFileName, setReviewFileName] = useState<string | null>(null);
  const [reviewFileError, setReviewFileError] = useState<string | null>(null);
  const [reviewDragOver, setReviewDragOver] = useState(false);
  const [parsedQuestions, setParsedQuestions] = useState<string[]>([]);
  const [parsedContext, setParsedContext] = useState('');
  const [parseStatus, setParseStatus] = useState<FileStatus>('idle');
  const reviewFileInputRef = useRef<HTMLInputElement>(null);

  // ============================================================================
  // 面试模式 — 简历文件解析
  // ============================================================================

  const parsePDF = async (buffer: ArrayBuffer): Promise<string> => {
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const texts: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items
        .filter((item) => 'str' in item)
        .map((item) => (item as { str: string }).str)
        .join(' ');
      texts.push(pageText);
    }
    return texts.join('\n\n');
  };

  const parseDOCX = async (buffer: ArrayBuffer): Promise<string> => {
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    return result.value;
  };

  const handleResumeFile = useCallback(async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['pdf', 'doc', 'docx'].includes(ext ?? '')) {
      setFileError('仅支持 PDF、DOC、DOCX 格式');
      setFileStatus('error');
      return;
    }

    setFileStatus('loading');
    setFileName(file.name);
    setFileError(null);

    try {
      const buffer = await file.arrayBuffer();
      const text = ext === 'pdf' ? await parsePDF(buffer) : await parseDOCX(buffer);
      setResumeText(text.trim());
      setFileStatus('success');
    } catch (err) {
      console.error('文件解析失败:', err);
      setFileError('文件解析失败，请确认文件未损坏');
      setFileStatus('error');
    }
  }, []);

  const onResumeFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleResumeFile(file);
      e.target.value = '';
    },
    [handleResumeFile],
  );

  const onResumeDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragOver(true); }, []);
  const onResumeDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragOver(false); }, []);
  const onResumeDrop = useCallback(
    (e: React.DragEvent) => { e.preventDefault(); setDragOver(false); const file = e.dataTransfer.files[0]; if (file) handleResumeFile(file); },
    [handleResumeFile],
  );

  const clearResume = useCallback(() => {
    setResumeText(''); setFileStatus('idle'); setFileName(null); setFileError(null);
  }, []);

  // ============================================================================
  // 复盘模式 — 文件上传与解析
  // ============================================================================

  const reviewSourceLabels: { key: ReviewSourceType; label: string; icon: string }[] = [
    { key: 'text', label: '文字', icon: '📝' },
    { key: 'document', label: '文档', icon: '📄' },
    { key: 'audio', label: '录音', icon: '🎙️' },
    { key: 'video', label: '视频', icon: '📹' },
  ];

  const reviewAcceptMap: Record<ReviewSourceType, string> = {
    video: '.mp4,.webm,.mov',
    audio: '.mp3,.wav,.m4a,.ogg,.webm',
    document: '.pdf,.doc,.docx',
    text: '',
  };

  const handleReviewFile = useCallback(
    async (file: File) => {
      setReviewFile(file);
      setReviewFileName(file.name);
      setReviewFileStatus('success');
      setReviewFileError(null);
      setParsedQuestions([]);
      setParsedContext('');
    },
    [],
  );

  const onReviewFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleReviewFile(file);
      e.target.value = '';
    },
    [handleReviewFile],
  );

  const onReviewDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setReviewDragOver(true); }, []);
  const onReviewDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setReviewDragOver(false); }, []);
  const onReviewDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setReviewDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleReviewFile(file);
    },
    [handleReviewFile],
  );

  /** 文档解析器（注入到 review-parser） */
  const documentParser = useCallback(async (file: File): Promise<string> => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    const buffer = await file.arrayBuffer();
    if (ext === 'pdf') return parsePDF(buffer);
    return parseDOCX(buffer);
  }, []);

  /** 开始解析复盘内容 */
  const handleParseReview = useCallback(async () => {
    if (reviewSource === 'text') {
      if (!reviewText.trim()) return;
      setParseStatus('loading');

      const apiKey = localStorage.getItem('ai_interview_api_key') || '';
      const providerConfig = getProviderConfig();

      try {
        const llmClient = createLLMClient({ apiKey, baseUrl: providerConfig.baseUrl });
        const questions = await extractQuestions(reviewText.trim(), llmClient);
        setParsedQuestions(questions);
        setParsedContext(reviewText.trim());
        setParseStatus('success');
      } catch (err) {
        console.error('问题提取失败:', err);
        setParseStatus('error');
        setReviewFileError('AI 解析失败，请检查 API Key 设置');
      }
      return;
    }

    if (!reviewFile) return;

    const apiKey = localStorage.getItem('ai_interview_api_key') || '';
    if (!apiKey) {
      setReviewFileError('请先在设置页面配置 API Key');
      return;
    }

    setParseStatus('loading');
    setReviewFileError(null);

    try {
      // Step 1: 解析文件内容为文本
      const text = await parseReviewFileContent(
        reviewFile,
        reviewSource as 'video' | 'audio' | 'document',
        { apiKey, documentParser },
      );
      setParsedContext(text);

      // Step 2: 使用 LLM 提取面试问题
      const providerConfig2 = getProviderConfig();

      const llmClient = createLLMClient({ apiKey, baseUrl: providerConfig2.baseUrl });
      const questions = await extractQuestions(text, llmClient);

      setParsedQuestions(questions);
      setParseStatus('success');
    } catch (err) {
      console.error('复盘解析失败:', err);
      setParseStatus('error');
      setReviewFileError(
        err instanceof Error ? err.message : '解析失败，请重试',
      );
    }
  }, [reviewSource, reviewFile, reviewText, documentParser]);

  // ============================================================================
  // 导航
  // ============================================================================

  const handleStart = () => {
    if (mode === 'interview') {
      navigate('/interview', {
        state: {
          mode: 'interview',
          resume: resumeText.trim(),
          jd: jdText.trim(),
          duration,
        },
      });
    } else {
      navigate('/interview', {
        state: {
          mode: 'review',
          resume: resumeText.trim(),
          jd: jdText.trim(),
          questions: parsedQuestions,
          context: parsedContext,
          duration: 900, // 复盘默认 15 分钟
        },
      });
    }
  };

  const hasResume = resumeText.trim().length > 0;
  const hasJd = jdText.trim().length > 0;
  const canStart = hasResume && hasJd && (
    mode === 'interview' ? true : parsedQuestions.length > 0
  );

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      {/* Hero */}
      <div className="mb-12 text-center">
        <h1 className="text-[2.75rem] font-bold tracking-[-0.022em] text-[#1d1d1f]">
          AI 模拟面试
        </h1>
        <p className="mt-3 text-[1.1875rem] leading-relaxed text-[#86868b] tracking-tight">
          填写简历和岗位 JD，选择面试或复盘模式，AI 面试官将为你量身定制面试体验。
        </p>
      </div>

      {/* API 未配置提示 */}
      {!hasApiKey && !apiPromptDismissed && (
        <div className="apple-card mb-8 flex items-center justify-between border-[#0071e3]/20 bg-[#0071e3]/5 p-5">
          <div className="flex items-center gap-3">
            <span className="text-xl">🔑</span>
            <div>
              <p className="text-[0.875rem] font-medium text-[#1d1d1f]">
                尚未配置 API Key
              </p>
              <p className="text-[0.75rem] text-[#86868b]">
                AI 面试、复盘解析、模拟回答等功能需要 API Key 才能使用
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/settings')}
              className="apple-btn-primary"
            >
              去设置
            </button>
            <button
              onClick={() => setApiPromptDismissed(true)}
              className="text-[0.75rem] text-[#aeaeb2] hover:text-[#86868b] transition-colors"
            >
              稍后
            </button>
          </div>
        </div>
      )}

      {/* ======================================================================== */}
      {/* 简历（必填，两种模式共用） */}
      {/* ======================================================================== */}
      <div className="apple-card mb-6 p-6">
        <h2 className="mb-1 text-[1.0625rem] font-semibold tracking-tight text-[#1d1d1f]">简历</h2>
        <p className="mb-4 text-[0.8125rem] text-[#86868b]">粘贴文本或上传文件</p>

        <div
          onDragOver={onResumeDragOver}
          onDragLeave={onResumeDragLeave}
          onDrop={onResumeDrop}
          className={`mb-4 rounded-2xl border-2 border-dashed p-5 text-center transition-all ${
            dragOver
              ? 'border-[#0071e3] bg-[#0071e3]/5'
              : 'border-[#d2d2d7] bg-[#f5f5f7] hover:border-[#aeaeb2]'
          }`}
        >
          <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx" onChange={onResumeFileChange} className="hidden" />

          {fileStatus === 'loading' ? (
            <div className="flex items-center justify-center gap-2 text-[0.8125rem] text-[#86868b]">
              <svg className="h-4 w-4 animate-spin text-[#0071e3]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              正在解析 {fileName}...
            </div>
          ) : fileStatus === 'error' ? (
            <div>
              <p className="text-[0.8125rem] text-[#ff3b30]">{fileError}</p>
              <button onClick={() => fileInputRef.current?.click()} className="mt-1 text-[0.8125rem] text-[#0071e3] hover:underline">重新选择文件</button>
            </div>
          ) : fileName && fileStatus === 'success' ? (
            <div className="flex items-center justify-center gap-2 text-[0.8125rem]">
              <span className="text-[#34c759]">✓</span>
              <span className="text-[#1d1d1f]">{fileName}</span>
              <span className="text-[#86868b]">已解析</span>
              <button onClick={() => fileInputRef.current?.click()} className="ml-2 text-[#0071e3] hover:underline">更换文件</button>
            </div>
          ) : (
            <div>
              <button onClick={() => fileInputRef.current?.click()} className="text-[0.8125rem] font-medium text-[#0071e3] hover:underline">
                上传 PDF / Word 文件
              </button>
              <p className="mt-1 text-[0.75rem] text-[#aeaeb2]">支持 .pdf .doc .docx 格式，也可直接拖拽文件到此处</p>
            </div>
          )}
        </div>

        <div className="relative">
          <textarea
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            placeholder="在此粘贴简历文本，或上传文件自动填充..."
            rows={8}
            className="apple-input w-full resize-y"
          />
          {resumeText && (
            <button onClick={clearResume} className="absolute right-3 top-3 text-[0.75rem] text-[#aeaeb2] hover:text-[#86868b]" title="清空">
              清空
            </button>
          )}
        </div>
        <p className="mt-1.5 text-[0.75rem] text-[#aeaeb2]">已输入 {resumeText.length} 字</p>
      </div>

      {/* ======================================================================== */}
      {/* 岗位 JD（必填，两种模式共用） */}
      {/* ======================================================================== */}
      <div className="apple-card mb-6 p-6">
        <h2 className="mb-1 text-[1.0625rem] font-semibold tracking-tight text-[#1d1d1f]">目标岗位 JD</h2>
        <p className="mb-4 text-[0.8125rem] text-[#86868b]">粘贴职位描述</p>
        <textarea
          value={jdText}
          onChange={(e) => setJdText(e.target.value)}
          placeholder="在此粘贴目标岗位的职位描述 (Job Description)..."
          rows={5}
          className="apple-input w-full resize-y"
        />
        <p className="mt-1.5 text-[0.75rem] text-[#aeaeb2]">已输入 {jdText.length} 字</p>
      </div>

      {/* ========== 模式切换 ========== */}
      <div className="mb-6 flex justify-center">
        <div className="inline-flex rounded-full bg-[#e8e8ed] p-0.5">
          <button
            onClick={() => setMode('interview')}
            className={`rounded-full px-8 py-2 text-[0.8125rem] font-medium tracking-tight transition-all ${
              mode === 'interview'
                ? 'bg-white text-[#1d1d1f] shadow-sm'
                : 'text-[#86868b] hover:text-[#1d1d1f]'
            }`}
          >
            面试
          </button>
          <button
            onClick={() => setMode('review')}
            className={`rounded-full px-8 py-2 text-[0.8125rem] font-medium tracking-tight transition-all ${
              mode === 'review'
                ? 'bg-white text-[#1d1d1f] shadow-sm'
                : 'text-[#86868b] hover:text-[#1d1d1f]'
            }`}
          >
            复盘
          </button>
        </div>
      </div>

      {/* ======================================================================== */}
      {/* 面试模式：时长选择 */}
      {/* ======================================================================== */}
      {mode === 'interview' && (
        <div className="apple-card mb-8 p-6">
          <h2 className="mb-4 text-[1.0625rem] font-semibold tracking-tight text-[#1d1d1f]">面试时长</h2>
          <div className="flex gap-2">
            {[
              { seconds: 300, label: '5 分钟' },
              { seconds: 600, label: '10 分钟' },
              { seconds: 900, label: '15 分钟' },
              { seconds: 1200, label: '20 分钟' },
              { seconds: 1800, label: '30 分钟' },
            ].map((opt) => (
              <button
                key={opt.seconds}
                onClick={() => setDuration(opt.seconds)}
                className={`rounded-full px-5 py-2 text-[0.8125rem] font-medium tracking-tight transition-all ${
                  duration === opt.seconds
                    ? 'bg-[#0071e3] text-white shadow-sm'
                    : 'bg-[#e8e8ed] text-[#1d1d1f] hover:bg-[#dcdce0]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ======================================================================== */}
      {/* 复盘模式 */}
      {/* ======================================================================== */}
      {mode === 'review' && (
        <>
          <div className="apple-card mb-6 p-6">
            <h2 className="mb-1 text-[1.0625rem] font-semibold tracking-tight text-[#1d1d1f]">选择内容来源</h2>
            <p className="mb-4 text-[0.8125rem] text-[#86868b]">选择要导入的内容类型</p>
            <div className="flex gap-2">
              {reviewSourceLabels.map((s) => (
                <button
                  key={s.key}
                  onClick={() => {
                    setReviewSource(s.key);
                    setReviewFile(null); setReviewFileName(null); setReviewFileStatus('idle');
                    setReviewFileError(null); setReviewText('');
                    setParsedQuestions([]); setParsedContext(''); setParseStatus('idle');
                  }}
                  className={`rounded-full px-4 py-1.5 text-[0.8125rem] font-medium tracking-tight transition-all ${
                    reviewSource === s.key
                      ? 'bg-[#0071e3] text-white shadow-sm'
                      : 'bg-[#e8e8ed] text-[#1d1d1f] hover:bg-[#dcdce0]'
                  }`}
                >
                  {s.icon} {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* 文字输入 */}
          {reviewSource === 'text' && (
            <div className="apple-card mb-6 p-6">
              <h2 className="mb-4 text-[1.0625rem] font-semibold tracking-tight text-[#1d1d1f]">文字内容</h2>
              <textarea
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                placeholder="在此粘贴面试对话记录或问题列表..."
                rows={8}
                className="apple-input w-full resize-y"
              />
              <p className="mt-1.5 text-[0.75rem] text-[#aeaeb2]">已输入 {reviewText.length} 字</p>
            </div>
          )}

          {/* 文件上传 */}
          {reviewSource !== 'text' && (
            <div className="apple-card mb-6 p-6">
              <h2 className="mb-4 text-[1.0625rem] font-semibold tracking-tight text-[#1d1d1f]">上传文件</h2>
              <div
                onDragOver={onReviewDragOver}
                onDragLeave={onReviewDragLeave}
                onDrop={onReviewDrop}
                className={`rounded-2xl border-2 border-dashed p-6 text-center transition-all ${
                  reviewDragOver
                    ? 'border-[#0071e3] bg-[#0071e3]/5'
                    : 'border-[#d2d2d7] bg-[#f5f5f7] hover:border-[#aeaeb2]'
                }`}
              >
                <input ref={reviewFileInputRef} type="file" accept={reviewAcceptMap[reviewSource]} onChange={onReviewFileChange} className="hidden" />
                {reviewFileStatus === 'success' && reviewFileName ? (
                  <div className="flex items-center justify-center gap-2 text-[0.8125rem]">
                    <span className="text-[#34c759]">✓</span>
                    <span className="text-[#1d1d1f]">{reviewFileName}</span>
                    <button onClick={() => reviewFileInputRef.current?.click()} className="ml-2 text-[#0071e3] hover:underline">更换文件</button>
                  </div>
                ) : (
                  <div>
                    <button onClick={() => reviewFileInputRef.current?.click()} className="text-[0.8125rem] font-medium text-[#0071e3] hover:underline">
                      选择文件
                    </button>
                    <p className="mt-1 text-[0.75rem] text-[#aeaeb2]">
                      支持 {reviewAcceptMap[reviewSource].replace(/\./g, '').replace(/,/g, ' / ')} 格式，也可拖拽文件到此处
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 解析按钮 */}
          <div className="mb-6 text-center">
            <button
              onClick={handleParseReview}
              disabled={parseStatus === 'loading' || (reviewSource === 'text' ? !reviewText.trim() : !reviewFile)}
              className="apple-btn-primary"
            >
              {parseStatus === 'loading' ? (
                <span className="flex items-center gap-2">
                  <svg className="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  解析中...
                </span>
              ) : (
                'AI 解析内容'
              )}
            </button>
            {reviewFileError && <p className="mt-2 text-[0.8125rem] text-[#ff3b30]">{reviewFileError}</p>}
          </div>

          {/* 解析结果预览 */}
          {parseStatus === 'success' && parsedQuestions.length > 0 && (
            <div className="apple-card mb-6 border-[#34c759]/20 bg-[#34c759]/5 p-5">
              <h3 className="mb-3 text-[0.9375rem] font-semibold tracking-tight text-[#1d1d1f]">
                解析完成 — 提取到 {parsedQuestions.length} 个问题
              </h3>
              <ol className="list-inside list-decimal space-y-1.5 text-[0.8125rem] text-[#1d1d1f]">
                {parsedQuestions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ol>
              {parsedContext && <p className="mt-3 text-[0.75rem] text-[#aeaeb2]">上下文共 {parsedContext.length} 字</p>}
            </div>
          )}
        </>
      )}

      {/* ========== 开始按钮 ========== */}
      <div className="text-center">
        <button
          onClick={handleStart}
          disabled={!canStart}
          className="apple-btn-primary px-12 py-3.5 text-[1rem]"
        >
          进入面试
        </button>
        {!canStart && (
          <p className="mt-3 text-[0.8125rem] text-[#aeaeb2]">
            {!hasResume
              ? '请先填写简历'
              : !hasJd
                ? '请填写目标岗位 JD'
                : '请导入内容并完成 AI 解析'}
          </p>
        )}
      </div>
    </div>
  );
}
