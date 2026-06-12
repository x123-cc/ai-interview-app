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
