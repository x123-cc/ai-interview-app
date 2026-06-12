/** 摄像头权限与采集状态 */
export type CameraState =
  | 'idle' // 初始状态，尚未请求权限
  | 'requesting' // 正在请求摄像头权限
  | 'active' // 权限已授予，摄像头正在采集
  | 'denied' // 用户拒绝权限或系统无摄像头
  | 'error'; // 采集过程中发生错误

/** 摄像头错误类型 */
export type CameraErrorType =
  | 'NotAllowedError' // 用户拒绝权限
  | 'NotFoundError' // 未检测到摄像头设备
  | 'NotReadableError' // 摄像头被其他应用占用
  | 'OverconstrainedError' // 不满足指定的约束条件
  | 'UnknownError'; // 其他未知错误

/** 摄像头错误信息 */
export interface CameraError {
  type: CameraErrorType;
  message: string;
}

/** useCamera Hook 配置选项 */
export interface UseCameraOptions {
  /** 首选摄像头朝向，默认 'user'（前置摄像头） */
  facingMode?: 'user' | 'environment';
  /** 视频宽度约束 */
  width?: number;
  /** 视频高度约束 */
  height?: number;
}

/** useCamera Hook 返回值 */
export interface UseCameraReturn {
  /** 当前摄像头状态 */
  state: CameraState;
  /** 采集到的 MediaStream，state 为 active 时可用 */
  stream: MediaStream | null;
  /** 错误信息，state 为 denied/error 时包含具体原因 */
  error: CameraError | null;
  /** 启动摄像头采集 */
  start: () => Promise<void>;
  /** 停止摄像头采集并释放资源 */
  stop: () => void;
}

/** 音频采集状态（复用摄像头状态机模式） */
export type AudioCaptureState = CameraState;

/** 音频采集错误类型 */
export type AudioCaptureErrorType = CameraErrorType;

/** 音频采集错误信息 */
export type AudioCaptureError = CameraError;

/** useAudioCapture Hook 配置选项 */
export interface UseAudioCaptureOptions {
  /** 指定音频输入设备 ID，不传则使用系统默认麦克风 */
  deviceId?: string;
}

/** useAudioCapture Hook 返回值 */
export interface UseAudioCaptureReturn {
  /** 当前音频采集状态 */
  state: AudioCaptureState;
  /** 实时音量分贝值（0-100），静音为 0 */
  volumeLevel: number;
  /** 错误信息 */
  error: AudioCaptureError | null;
  /** 启动麦克风采集 */
  start: () => Promise<void>;
  /** 停止麦克风采集并释放资源 */
  stop: () => void;
}

/** 语音识别状态 */
export type STTState =
  | 'idle' // 初始状态，未开始监听
  | 'listening' // 正在监听语音
  | 'processing' // 正在处理识别结果
  | 'error' // 识别过程中发生错误
  | 'unsupported'; // 浏览器不支持 SpeechRecognition API

/** 语音识别结果 */
export interface STTResult {
  /** 识别出的文本 */
  transcript: string;
  /** 是否为最终结果（非中间结果） */
  isFinal: boolean;
  /** 识别置信度 0-1 */
  confidence: number;
}

/** useSTT Hook 配置选项 */
export interface UseSTTOptions {
  /** 识别语言，默认 'zh-CN' */
  lang?: string;
  /** 是否持续监听，默认 false（单次识别后自动停止） */
  continuous?: boolean;
  /** 静默超时时间（毫秒），用户停止说话超过此时长后自动截止。默认 1500ms */
  silenceTimeout?: number;
}

/** useSTT Hook 返回值 */
export interface UseSTTReturn {
  /** 当前识别状态 */
  state: STTState;
  /** 最终识别文本（多段累积） */
  transcript: string;
  /** 当前中间结果文本（未确认） */
  interimTranscript: string;
  /** 是否正在监听 */
  isListening: boolean;
  /** 错误信息 */
  error: string | null;
  /** 浏览器是否支持语音识别 */
  isSupported: boolean;
  /** 开始监听 */
  start: () => void;
  /** 停止监听并返回已识别文本 */
  stop: () => void;
  /** 取消监听并丢弃当前结果 */
  abort: () => void;
}

/** 语音合成状态 */
export type TTSState =
  | 'idle'        // 空闲，无语音在播放
  | 'speaking'    // 正在播放语音
  | 'paused';     // 播放已暂停

/** TTS 语音选项 */
export interface TTSVoiceOptions {
  /** 语速 0.5-2.0，默认 1.0 */
  rate?: number;
  /** 音调 0.5-2.0，默认 1.0 */
  pitch?: number;
  /** 音量 0-1，默认 1.0 */
  volume?: number;
  /** 语言代码，默认 'zh-CN' */
  lang?: string;
}

/** TTS 语音信息 */
export interface TTSVoiceInfo {
  /** 语音唯一标识 */
  voiceURI: string;
  /** 语音名称 */
  name: string;
  /** 语言代码 */
  lang: string;
  /** 是否为本地语音（非远程合成） */
  localService: boolean;
}

/** useTTS Hook 返回值 */
export interface UseTTSReturn {
  /** 当前播放状态 */
  state: TTSState;
  /** 是否支持语音合成 */
  isSupported: boolean;
  /** 可用语音列表 */
  voices: TTSVoiceInfo[];
  /** 当前激活的语音 URI */
  activeVoiceURI: string | null;
  /** 设置激活的语音 */
  setVoice: (voiceURI: string) => void;
  /** 当前语速 */
  rate: number;
  /** 设置语速 0.5-2.0 */
  setRate: (rate: number) => void;
  /** 当前音调 */
  pitch: number;
  /** 设置音调 0.5-2.0 */
  setPitch: (pitch: number) => void;
  /** 播报指定文本（加入队列尾部） */
  speak: (text: string, options?: TTSVoiceOptions) => void;
  /** 批量播报多段文本 */
  speakAll: (texts: string[], options?: TTSVoiceOptions) => void;
  /** 停止所有语音并清空队列 */
  stop: () => void;
  /** 暂停当前语音 */
  pause: () => void;
  /** 恢复暂停的语音 */
  resume: () => void;
}
