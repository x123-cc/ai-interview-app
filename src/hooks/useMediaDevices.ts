import { useState, useCallback, useEffect, useRef } from 'react';

/** 按类别分组的媒体设备列表 */
export interface MediaDeviceGroups {
  /** 音频输入设备（麦克风） */
  audioInputs: MediaDeviceInfo[];
  /** 视频输入设备（摄像头） */
  videoInputs: MediaDeviceInfo[];
  /** 音频输出设备（扬声器） */
  audioOutputs: MediaDeviceInfo[];
}

/** useMediaDevices Hook 返回值 */
export interface UseMediaDevicesReturn {
  /** 按类别分组的设备列表 */
  devices: MediaDeviceGroups;
  /** 手动刷新设备列表 */
  refresh: () => Promise<void>;
}

/**
 * 枚举所有媒体设备并按类别分组
 */
function groupDevices(allDevices: MediaDeviceInfo[]): MediaDeviceGroups {
  return {
    audioInputs: allDevices.filter((d) => d.kind === 'audioinput'),
    videoInputs: allDevices.filter((d) => d.kind === 'videoinput'),
    audioOutputs: allDevices.filter((d) => d.kind === 'audiooutput'),
  };
}

/**
 * 媒体设备枚举 Hook
 *
 * 调用 navigator.mediaDevices.enumerateDevices() 获取所有媒体设备，
 * 按类别分组为音频输入/视频输入/音频输出三类。
 * 监听 devicechange 事件自动刷新设备列表（如插入/拔出耳麦）。
 *
 * 注意：浏览器安全策略要求至少获得过一次媒体权限后，
 * 才会在 enumerateDevices 结果中返回设备标签（label 字段）。
 *
 * @returns 分组的设备列表和手动刷新方法
 */
export default function useMediaDevices(): UseMediaDevicesReturn {
  const [devices, setDevices] = useState<MediaDeviceGroups>({
    audioInputs: [],
    videoInputs: [],
    audioOutputs: [],
  });
  const mountedRef = useRef(true);

  /**
   * 刷新设备列表
   */
  const refresh = useCallback(async () => {
    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      if (mountedRef.current) {
        setDevices(groupDevices(allDevices));
      }
    } catch {
      // enumerateDevices 失败时保持当前列表不变
    }
  }, []);

  /**
   * 挂载时枚举设备，卸载时标记取消。
   * 监听 devicechange 事件以自动刷新。
   */
  useEffect(() => {
    mountedRef.current = true;

    // 异步加载设备列表，不会在 effect 中同步触发 setState
    const loadDevices = async () => {
      try {
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        if (mountedRef.current) {
          setDevices(groupDevices(allDevices));
        }
      } catch {
        // 静默处理
      }
    };
    loadDevices();

    const handleDeviceChange = () => {
      loadDevices();
    };
    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);

    return () => {
      mountedRef.current = false;
      navigator.mediaDevices.removeEventListener(
        'devicechange',
        handleDeviceChange,
      );
    };
  }, []);

  return { devices, refresh };
}
