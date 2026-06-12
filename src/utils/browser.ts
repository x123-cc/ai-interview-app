/**
 * 检测当前浏览器是否支持 Web Speech API（语音识别）
 *
 * 同时检查标准 SpeechRecognition 和 WebKit 前缀版本（webkitSpeechRecognition）。
 *
 * @returns 支持语音识别时返回 true
 */
export function isSpeechRecognitionSupported(): boolean {
  return (
    typeof SpeechRecognition !== 'undefined' ||
    typeof webkitSpeechRecognition !== 'undefined'
  );
}

/**
 * 获取浏览器首选语言（转换为 BCP 47 格式）
 *
 * 优先级：navigator.language > 浏览器 UI 语言 > 默认 'zh-CN'
 *
 * 返回的语言代码可直接用于 SpeechRecognition.lang 和 TTS voice 选择。
 *
 * @returns BCP 47 语言代码，如 'zh-CN'、'en-US'、'ja-JP'
 */
export function getPreferredLanguage(): string {
  const lang = navigator.language || 'zh-CN';
  // 将简写格式转为完整 BCP 47（如 'zh' → 'zh-CN'）
  if (lang === 'zh') return 'zh-CN';
  if (lang === 'en') return 'en-US';
  if (lang === 'ja') return 'ja-JP';
  if (lang === 'ko') return 'ko-KR';
  return lang;
}

/**
 * 检测当前浏览器是否支持 MediaDevices API（摄像头/麦克风）
 *
 * @returns 支持时返回 true
 */
export function isMediaDevicesSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices !== 'undefined' &&
    typeof navigator.mediaDevices.getUserMedia !== 'undefined'
  );
}

/**
 * 汇总浏览器兼容性信息
 *
 * 用于设置页面展示各项功能的支持情况。
 *
 * @returns 各 API 是否支持的汇总对象
 */
export function getBrowserCapabilities(): {
  speechRecognition: boolean;
  speechSynthesis: boolean;
  mediaDevices: boolean;
} {
  return {
    speechRecognition: isSpeechRecognitionSupported(),
    speechSynthesis:
      typeof window !== 'undefined' &&
      typeof window.speechSynthesis !== 'undefined',
    mediaDevices: isMediaDevicesSupported(),
  };
}
