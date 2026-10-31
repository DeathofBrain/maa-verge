import { useEffect, useRef, useState, type HTMLAttributes } from 'react';

const STORAGE_KEY = 'maaverge:ui:sidebar-width';
const MIN_WIDTH = 72;
const MAX_WIDTH = 320;
const DEFAULT_WIDTH = 224;
const LABEL_WIDTH = 192;
const clampWidth = (width: number) => Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width)));

function readWidth() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const width = saved === null ? DEFAULT_WIDTH : Number(saved);
    return Number.isFinite(width) ? clampWidth(width) : DEFAULT_WIDTH;
  } catch {
    return DEFAULT_WIDTH;
  }
}

export default function useSidebarResize() {
  const [width, setWidth] = useState(readWidth);
  const [resizing, setResizing] = useState(false);
  const drag = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);
  const handle = useRef<HTMLDivElement | null>(null);
  const compact = width < LABEL_WIDTH;

  const finish = () => {
    const pointerId = drag.current?.pointerId;
    drag.current = null;
    setResizing(false);
    if (pointerId !== undefined && handle.current?.hasPointerCapture(pointerId)) {
      handle.current.releasePointerCapture(pointerId);
    }
  };

  useEffect(() => {
    if (resizing) return;
    try {
      localStorage.setItem(STORAGE_KEY, String(width));
    } catch {
      /* The sidebar remains usable when optional UI preferences cannot be saved. */
    }
  }, [width, resizing]);

  useEffect(() => {
    if (!resizing) return;
    const mobile = window.matchMedia('(max-width: 760px)');
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !drag.current) return;
      event.preventDefault();
      setWidth(drag.current.startWidth);
      finish();
    };
    window.addEventListener('blur', finish);
    window.addEventListener('keydown', onKeyDown, true);
    mobile.addEventListener('change', finish);
    return () => {
      window.removeEventListener('blur', finish);
      window.removeEventListener('keydown', onKeyDown, true);
      mobile.removeEventListener('change', finish);
    };
  }, [resizing]);

  const handleProps: HTMLAttributes<HTMLDivElement> = {
    role: 'separator',
    tabIndex: 0,
    'aria-label': '调整侧栏宽度',
    'aria-orientation': 'vertical',
    'aria-controls': 'app-sidebar',
    'aria-valuemin': MIN_WIDTH,
    'aria-valuemax': MAX_WIDTH,
    'aria-valuenow': width,
    'aria-valuetext': `${width} 像素，${compact ? '仅显示图标' : '显示图标和文字'}`,
    title: '拖动调整侧栏宽度，双击恢复默认；也可用左右方向键调整',
    onPointerDown: (event) => {
      if (event.button !== 0 || !event.isPrimary) return;
      event.preventDefault();
      event.currentTarget.focus();
      event.currentTarget.setPointerCapture(event.pointerId);
      handle.current = event.currentTarget;
      drag.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: width };
      setResizing(true);
    },
    onPointerMove: (event) => {
      const current = drag.current;
      if (current?.pointerId !== event.pointerId) return;
      setWidth(clampWidth(current.startWidth + event.clientX - current.startX));
    },
    onPointerUp: (event) => {
      if (drag.current?.pointerId === event.pointerId) finish();
    },
    onPointerCancel: finish,
    onLostPointerCapture: finish,
    onDoubleClick: () => setWidth(DEFAULT_WIDTH),
    onKeyDown: (event) => {
      if (drag.current) return;
      const step = event.shiftKey ? 32 : 8;
      const next = {
        ArrowLeft: width - step,
        ArrowRight: width + step,
        Home: MIN_WIDTH,
        End: MAX_WIDTH,
        Enter: DEFAULT_WIDTH,
      }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      setWidth(clampWidth(next));
    },
  };

  return { width, compact, resizing, handleProps };
}
