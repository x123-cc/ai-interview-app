import type { LLMClient } from '@/types';
import { transcribeWithWhisper } from './stt';

/**
 * 将 AudioBuffer 转换为 WAV 格式的 Blob
 */
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitsPerSample = 16;

  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;

  const data = buffer.getChannelData(0);
  const dataLength = data.length * bytesPerSample;
  const headerLength = 44;
  const totalLength = headerLength + dataLength;

  const arrayBuffer = new ArrayBuffer(totalLength);
  const view = new DataView(arrayBuffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, totalLength - 8, true);
  writeString(view, 8, 'WAVE');

  // fmt chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  // Write samples
  let offset = 44;
  for (let i = 0; i < data.length; i++) {
    const sample = Math.max(-1, Math.min(1, data[i]));
    const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    view.setInt16(offset, int16, true);
    offset += 2;
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/**
 * 从音频文件中提取文本
 * 解码音频 → 转 WAV → 调用 Whisper API
 */
async function parseAudioFile(file: File, apiKey: string): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const audioContext = new AudioContext();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  await audioContext.close();

  const wavBlob = audioBufferToWav(audioBuffer);

  const result = await transcribeWithWhisper(wavBlob, {
    apiKey,
    language: 'zh',
  });

  return result.text;
}

/**
 * 从视频文件中提取音频并转文字
 *
 * 使用 video 元素 + MediaRecorder 提取音频轨道，
 * 然后调用 Whisper API 识别。
 */
async function parseVideoFile(file: File, apiKey: string): Promise<string> {
  const videoUrl = URL.createObjectURL(file);

  try {
    const video = document.createElement('video');
    video.src = videoUrl;
    video.muted = false;
    video.playsInline = true;

    // 等待视频加载
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('视频加载失败'));
      video.load();
    });

    // 创建音频上下文用于捕获视频的音频
    const audioContext = new AudioContext();
    const source = audioContext.createMediaElementSource(video);
    const destination = audioContext.createMediaStreamDestination();
    source.connect(destination);
    source.connect(audioContext.destination); // 为了解码需要连接到 destination

    // 使用 MediaRecorder 录制音频
    const mediaRecorder = new MediaRecorder(destination.stream, {
      mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm',
    });

    const chunks: Blob[] = [];
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    // 播放视频以提取音频
    video.playbackRate = 2; // 加速以减少等待
    mediaRecorder.start();
    video.play();

    // 等待视频播放完毕
    await new Promise<void>((resolve) => {
      video.onended = () => resolve();
      video.onerror = () => resolve(); // 出错也继续
    });

    // 确保 MediaRecorder 捕获了所有数据
    await new Promise<void>((resolve) => {
      mediaRecorder.onstop = () => resolve();
      mediaRecorder.stop();
      // 如果视频还在播放，等待一小段时间
      if (!video.ended) {
        setTimeout(() => {
          if (mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
          }
        }, 500);
      }
    });

    audioContext.close();
    video.pause();

    if (chunks.length === 0) {
      throw new Error('未能从视频中提取到音频');
    }

    const audioBlob = new Blob(chunks, { type: 'audio/webm' });

    const result = await transcribeWithWhisper(audioBlob, {
      apiKey,
      language: 'zh',
    });

    return result.text;
  } finally {
    URL.revokeObjectURL(videoUrl);
  }
}

/**
 * LLM 提取面试问题的 System Prompt
 */
const EXTRACT_QUESTIONS_PROMPT = `你是一个面试问题分析专家。根据以下文本内容，提取出所有面试中被问到的问题。

## 要求
1. 按原文中的顺序列出问题
2. 如果问题是追问，保留其原始表述
3. 忽略非问题的对话内容（如开场白、评价、闲聊）
4. 每个问题一行
5. 输出纯 JSON 格式：{"questions": ["问题1", "问题2", ...]}

## 文本内容
{text}`;

/**
 * 使用 LLM 从文本中提取面试问题
 */
export async function extractQuestions(
  text: string,
  llmClient: LLMClient,
): Promise<string[]> {
  const prompt = EXTRACT_QUESTIONS_PROMPT.replace('{text}', text);

  const result = await llmClient.chat([
    { role: 'user', content: prompt },
  ]);

  try {
    // 尝试解析 JSON 响应
    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed.questions)) {
        return parsed.questions.filter(
          (q: unknown): q is string => typeof q === 'string' && q.length > 0,
        );
      }
    }
  } catch {
    // JSON 解析失败，按行解析
    console.warn('LLM 问题提取 JSON 解析失败，回退到按行解析');
  }

  // 回退：按行分割，过滤空行
  return result.content
    .split('\n')
    .map((line) => line.replace(/^\d+[\.\、\)]\s*/, '').trim())
    .filter((line) => line.length > 5 && (line.endsWith('?') || line.endsWith('？')));
}

/**
 * 解析复盘文件内容
 *
 * 根据文件类型选择不同的解析策略：
 * - document: 调用外部解析器（pdfjs-dist / mammoth）
 * - audio: 解码 → WAV → Whisper
 * - video: 提取音频 → Whisper
 * - text: 直接返回
 *
 * @param file - 上传的文件
 * @param type - 文件类型
 * @param options - 解析选项
 * @returns 解析出的文本内容
 */
export async function parseReviewFileContent(
  file: File,
  type: 'video' | 'audio' | 'document',
  options: {
    apiKey: string;
    /** 文档文本解析器（由调用方注入，用于 pdf/docx 解析） */
    documentParser?: (file: File) => Promise<string>;
  },
): Promise<string> {
  switch (type) {
    case 'audio':
      return parseAudioFile(file, options.apiKey);

    case 'video':
      return parseVideoFile(file, options.apiKey);

    case 'document':
      if (options.documentParser) {
        return options.documentParser(file);
      }
      throw new Error('文档解析器未提供');

    default:
      throw new Error(`不支持的文件类型: ${type}`);
  }
}
