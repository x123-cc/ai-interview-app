import { useState, useEffect } from 'react';

/** 网络连接类型 */
export type ConnectionType =
  | 'slow-2g'
  | '2g'
  | '3g'
  | '4g'
  | '5g'
  | 'ethernet'
  | 'wifi'
  | 'unknown';

/** useNetworkStatus 返回值 */
export interface UseNetworkStatusReturn {
  /** 是否有网络连接 */
  isOnline: boolean;
  /** 连接类型（4g/wifi/unknown 等） */
  connectionType: ConnectionType;
  /** 是否为慢速网络（2G/3G） */
  isSlow: boolean;
}

/**
 * 网络状态感知 Hook
 *
 * 监听浏览器 online/offline 事件和 Network Information API，
 * 提供网络连接状态和连接类型信息。
 *
 * 用途：端云协同调度器根据网络状态决定是否上传帧、
 * 延迟云端调用或切换为纯本地模式。
 *
 * @returns 网络状态信息
 */
export default function useNetworkStatus(): UseNetworkStatusReturn {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [connectionType, setConnectionType] =
    useState<ConnectionType>('unknown');

  useEffect(() => {
    /**
     * 从 Network Information API 读取连接类型
     */
    const updateConnectionType = () => {
      const connection =
        (navigator as Record<string, unknown>).connection as
          | { effectiveType?: string }
          | undefined;
      if (connection?.effectiveType) {
        setConnectionType(
          connection.effectiveType as ConnectionType,
        );
      }
    };

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    // 初始化连接类型
    updateConnectionType();

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Network Information API 的 change 事件
    const connection = (navigator as Record<string, unknown>)
      .connection as EventTarget | undefined;
    if (connection) {
      connection.addEventListener('change', updateConnectionType);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (connection) {
        connection.removeEventListener(
          'change',
          updateConnectionType,
        );
      }
    };
  }, []);

  // 判断是否为慢速网络（2G/3G 视为慢速）
  const isSlow =
    connectionType === 'slow-2g' ||
    connectionType === '2g' ||
    connectionType === '3g';

  return { isOnline, connectionType, isSlow };
}
