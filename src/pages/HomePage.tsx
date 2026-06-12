import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';

// 配置 PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString();

type FileStatus = 'idle' | 'loading' | 'success' | 'error';

export default function HomePage() {
  const navigate = useNavigate();

  const [resumeText, setResumeText] = useState('');
  const [jdText, setJdText] = useState('');
  const [fileStatus, setFileStatus] = useState<FileStatus>('idle');
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** 解析 PDF 文件 */
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

  /** 解析 DOCX 文件 */
  const parseDOCX = async (buffer: ArrayBuffer): Promise<string> => {
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    return result.value;
  };

  /** 处理文件选择/上传 */
  const handleFile = useCallback(async (file: File) => {
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
      let text: string;

      if (ext === 'pdf') {
        text = await parsePDF(buffer);
      } else {
        text = await parseDOCX(buffer);
      }

      setResumeText(text.trim());
      setFileStatus('success');
    } catch (err) {
      console.error('文件解析失败:', err);
      setFileError('文件解析失败，请确认文件未损坏');
      setFileStatus('error');
    }
  }, []);

  /** 处理文件选择事件 */
  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      // 重置 input 以允许重复选择同一文件
      e.target.value = '';
    },
    [handleFile],
  );

  /** 拖拽事件 */
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  /** 清除已上传的简历 */
  const clearResume = useCallback(() => {
    setResumeText('');
    setFileStatus('idle');
    setFileName(null);
    setFileError(null);
  }, []);

  /** 开始面试 */
  const handleStart = () => {
    navigate('/interview', {
      state: {
        resume: resumeText.trim(),
        jd: jdText.trim(),
      },
    });
  };

  const canStart = resumeText.trim().length > 0 && jdText.trim().length > 0;

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <div className="mb-10 text-center">
        <h1 className="text-4xl font-semibold text-gray-900">AI 模拟面试</h1>
        <p className="mt-4 text-lg text-gray-600">
          上传简历与岗位描述，AI 面试官将为你量身定制面试题目，模拟真实面试场景。
        </p>
      </div>

      {/* ===== 1. 简历 ===== */}
      <div className="mb-8">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-lg font-medium text-gray-800">简历</h2>
          <span className="text-sm text-gray-400">粘贴文本或上传文件</span>
        </div>

        {/* 文件上传区域 */}
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={`mb-3 rounded-lg border-2 border-dashed p-4 text-center transition-colors ${
            dragOver
              ? 'border-blue-400 bg-blue-50'
              : 'border-gray-300 bg-gray-50 hover:border-gray-400'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx"
            onChange={onFileChange}
            className="hidden"
          />

          {fileStatus === 'loading' ? (
            <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
              <svg
                className="h-5 w-5 animate-spin text-blue-500"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              正在解析 {fileName}...
            </div>
          ) : fileStatus === 'error' ? (
            <div>
              <p className="text-sm text-red-500">{fileError}</p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="mt-1 text-sm text-blue-600 hover:text-blue-700"
              >
                重新选择文件
              </button>
            </div>
          ) : fileName && fileStatus === 'success' ? (
            <div className="flex items-center justify-center gap-2 text-sm">
              <span className="text-green-600">✓</span>
              <span className="text-gray-700">{fileName}</span>
              <span className="text-gray-400">已解析</span>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="ml-2 text-blue-600 hover:text-blue-700"
              >
                更换文件
              </button>
            </div>
          ) : (
            <div>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                上传 PDF / Word 文件
              </button>
              <p className="mt-1 text-xs text-gray-400">
                支持 .pdf .doc .docx 格式，也可直接拖拽文件到此处
              </p>
            </div>
          )}
        </div>

        {/* 简历文本输入 */}
        <div className="relative">
          <textarea
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            placeholder="在此粘贴简历文本，或上传文件自动填充..."
            rows={8}
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
          />
          {resumeText && (
            <button
              onClick={clearResume}
              className="absolute right-3 top-3 text-xs text-gray-400 hover:text-gray-600"
              title="清空"
            >
              清空
            </button>
          )}
        </div>
        <p className="mt-1 text-xs text-gray-400">
          已输入 {resumeText.length} 字
          {resumeText.length > 0 && (
            <span> · 约 {Math.ceil(resumeText.length / 500)} 字 / 页</span>
          )}
        </p>
      </div>

      {/* ===== 2. 目标岗位 JD ===== */}
      <div className="mb-10">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-lg font-medium text-gray-800">目标岗位 JD</h2>
          <span className="text-sm text-gray-400">粘贴职位描述</span>
        </div>

        <textarea
          value={jdText}
          onChange={(e) => setJdText(e.target.value)}
          placeholder="在此粘贴目标岗位的职位描述 (Job Description)..."
          rows={6}
          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
        />
        <p className="mt-1 text-xs text-gray-400">
          已输入 {jdText.length} 字
        </p>
      </div>

      {/* ===== 开始按钮 ===== */}
      <div className="text-center">
        <button
          onClick={handleStart}
          disabled={!canStart}
          className="rounded-lg bg-blue-600 px-10 py-3 text-lg font-semibold text-white shadow-md transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          开始面试
        </button>
        {!canStart && (
          <p className="mt-2 text-sm text-gray-400">
            请填写简历和岗位 JD 后开始面试
          </p>
        )}
      </div>
    </div>
  );
}
