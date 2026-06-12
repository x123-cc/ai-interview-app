import { useState, useRef, useCallback, useEffect } from 'react';
import type { CameraState, CameraError } from '@/types';
import CameraView from '@/components/camera/CameraView';
import CameraStatus from '@/components/camera/CameraStatus';

interface FloatingCameraProps {
  stream: MediaStream | null;
  cameraState: CameraState;
  cameraError: CameraError | null;
  onRetry: () => void;
  onStart: () => void;
  /** 受控：是否展开为内联大屏模式 */
  expanded: boolean;
  /** 展开/折叠切换回调 */
  onExpandToggle: () => void;
}

interface Position {
  left: number;
  top: number;
}

interface Size {
  width: number;
  height: number;
}

const DEFAULT_SIZE: Size = { width: 256, height: 192 };
const MIN_SIZE: Size = { width: 160, height: 120 };
const MAX_SIZE: Size = { width: 640, height: 480 };

export default function FloatingCamera({
  stream,
  cameraState,
  cameraError,
  onRetry,
  onStart,
  expanded,
  onExpandToggle,
}: FloatingCameraProps) {
  const [position, setPosition] = useState<Position | null>(null);
  const [size, setSize] = useState<Size>(DEFAULT_SIZE);
  const [isPinned, setIsPinned] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    startLeft: number;
    startTop: number;
  } | null>(null);
  const resizeRef = useRef<{
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
  } | null>(null);

  // ── 拖动 ──
  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      if (isPinned || expanded) return;
      e.preventDefault();
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startLeft: rect.left,
        startTop: rect.top,
      };
    },
    [isPinned, expanded],
  );

  // ── 缩放 ──
  const onResizeStart = useCallback(
    (e: React.MouseEvent) => {
      if (isPinned || expanded) return;
      e.preventDefault();
      e.stopPropagation();
      resizeRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startWidth: size.width,
        startHeight: size.height,
      };
    },
    [isPinned, expanded, size],
  );

  // ── 全局鼠标事件 ──
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (dragRef.current) {
        const dx = e.clientX - dragRef.current.startX;
        const dy = e.clientY - dragRef.current.startY;
        setPosition({
          left: dragRef.current.startLeft + dx,
          top: dragRef.current.startTop + dy,
        });
      }
      if (resizeRef.current) {
        const dx = e.clientX - resizeRef.current.startX;
        const dy = e.clientY - resizeRef.current.startY;
        setSize({
          width: Math.min(MAX_SIZE.width, Math.max(MIN_SIZE.width, resizeRef.current.startWidth + dx)),
          height: Math.min(MAX_SIZE.height, Math.max(MIN_SIZE.height, resizeRef.current.startHeight + dy)),
        });
      }
    };
    const onMouseUp = () => {
      dragRef.current = null;
      resizeRef.current = null;
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const hasStream = cameraState === 'active' && stream;

  // ── 视频内容渲染 ──
  const videoContent = hasStream ? (
    <CameraView stream={stream} mirrored className="aspect-[4/3] w-full object-contain" />
  ) : (
    <div className="flex aspect-[4/3] w-full items-center justify-center bg-gray-900">
      {cameraState === 'idle' && (
        <button
          onClick={onStart}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          开启摄像头
        </button>
      )}
      {cameraState === 'requesting' && (
        <span className="text-sm text-gray-400">正在请求摄像头...</span>
      )}
    </div>
  );

  // ── 标题栏 ──
  const titleBar = (
    <div
      onMouseDown={onDragStart}
      className={`flex items-center justify-between bg-[#1d1d1f]/90 backdrop-blur-xl px-3 py-1.5 rounded-t-2xl ${
        isPinned || expanded ? 'cursor-default' : 'cursor-move'
      }`}
    >
      <span className="text-[0.6875rem] font-medium tracking-tight text-white/80">
        {expanded ? '摄像头 · 居中' : '摄像头'}
      </span>
      <div className="flex items-center gap-0.5">
        {!expanded && (
          <button
            onClick={() => setIsPinned(!isPinned)}
            title={isPinned ? '取消固定' : '固定位置'}
            className={`rounded-full p-1 text-[0.625rem] transition-colors ${
              isPinned ? 'bg-white/20 text-white' : 'text-white/50 hover:text-white/80'
            }`}
          >
            📌
          </button>
        )}
        <button
          onClick={onExpandToggle}
          title={expanded ? '还原到右上角' : '放大居中'}
          className="rounded-full p-1 text-[0.625rem] text-white/50 transition-colors hover:text-white/80"
        >
          {expanded ? '🔽' : '🔍'}
        </button>
      </div>
    </div>
  );

  // ── 状态栏 ──
  const statusBar = (
    <div className="mt-1">
      <CameraStatus state={cameraState} error={cameraError} onRetry={onRetry} />
    </div>
  );

  // ── 缩放句柄（仅浮动模式） ──
  const resizeHandle = !isPinned && !expanded && (
    <div
      onMouseDown={onResizeStart}
      className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize rounded-bl"
      style={{
        background: 'linear-gradient(135deg, transparent 50%, rgba(156,163,175,0.6) 50%)',
      }}
      title="拖动调整大小"
    />
  );

  // ====================================================================
  // 展开模式
  // ====================================================================
  if (expanded) {
    return (
      <div className="mx-auto w-full max-w-4xl select-none">
        {titleBar}
        <div className="overflow-hidden rounded-b-2xl bg-black/95">
          <div className="mx-auto" style={{ maxHeight: '45vh' }}>
            {videoContent}
          </div>
        </div>
        {statusBar}
      </div>
    );
  }

  // ====================================================================
  // 浮动模式
  // ====================================================================
  const containerStyle: React.CSSProperties = {
    position: 'fixed',
    width: size.width,
    zIndex: 40,
  };
  if (position) {
    containerStyle.left = position.left;
    containerStyle.top = position.top;
  } else {
    containerStyle.right = 16;
    containerStyle.top = 16;
  }

  return (
    <div ref={containerRef} style={containerStyle} className="select-none">
      {titleBar}
      <div className="overflow-hidden rounded-b-2xl bg-black/95">
        {videoContent}
      </div>
      {statusBar}
      {resizeHandle}
    </div>
  );
}
