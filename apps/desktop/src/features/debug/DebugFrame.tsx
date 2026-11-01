import { useRef, useState, type PointerEvent } from 'react';
import type { ScreenFrame } from '@maaverge/contracts';
import Button from '@/kit/Button';

type Point = { x: number; y: number };
export type FrameSelection = { point: Point; roi?: [number, number, number, number] };
type Props = {
  frame: ScreenFrame;
  disabled: boolean;
  onSelect: (selection: FrameSelection) => void;
};

export default function DebugFrame({ frame, disabled, onSelect }: Props) {
  const image = useRef<HTMLImageElement>(null);
  const anchor = useRef<Point | null>(null);
  const [mode, setMode] = useState<'point' | 'roi'>('point');
  const [selection, setSelection] = useState<FrameSelection>();
  const coordinate = (event: PointerEvent<HTMLImageElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(
        0,
        Math.min(
          frame.width - 1,
          Math.floor(((event.clientX - rect.left) / rect.width) * frame.width),
        ),
      ),
      y: Math.max(
        0,
        Math.min(
          frame.height - 1,
          Math.floor(((event.clientY - rect.top) / rect.height) * frame.height),
        ),
      ),
    };
  };
  return (
    <section aria-label="调试画面" className="debug-frame-panel">
      <div className="debug-inline">
        <h3>画面选点与选区</h3>
        <Button
          size="sm"
          aria-pressed={mode === 'point'}
          disabled={disabled}
          onClick={() => setMode('point')}
        >
          选点
        </Button>
        <Button
          size="sm"
          aria-pressed={mode === 'roi'}
          disabled={disabled}
          onClick={() => setMode('roi')}
        >
          选区
        </Button>
      </div>
      <p className="debug-muted">
        {frame.width} × {frame.height} · 仅填入参数，执行需点击运行。坐标也可在参数中输入。
      </p>
      <div className="debug-frame">
        <img
          ref={image}
          src={`data:${frame.mimeType};base64,${frame.data}`}
          alt="当前调试设备截图"
          draggable={false}
          onPointerDown={(event) => {
            if (disabled || event.button !== 0) return;
            anchor.current = coordinate(event);
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerCancel={() => {
            anchor.current = null;
          }}
          onPointerUp={(event) => {
            const from = anchor.current;
            anchor.current = null;
            if (disabled || !from) return;
            const to = coordinate(event);
            const next: FrameSelection =
              mode === 'point'
                ? { point: to }
                : {
                    point: { x: Math.min(from.x, to.x), y: Math.min(from.y, to.y) },
                    roi: [
                      Math.min(from.x, to.x),
                      Math.min(from.y, to.y),
                      Math.abs(to.x - from.x) + 1,
                      Math.abs(to.y - from.y) + 1,
                    ],
                  };
            setSelection(next);
            onSelect(next);
          }}
        />
        {selection?.roi && (
          <div
            className="debug-frame-roi"
            aria-hidden="true"
            style={{
              left: `${(selection.roi[0] / frame.width) * 100}%`,
              top: `${(selection.roi[1] / frame.height) * 100}%`,
              width: `${(selection.roi[2] / frame.width) * 100}%`,
              height: `${(selection.roi[3] / frame.height) * 100}%`,
            }}
          />
        )}
      </div>
      <p role="status" className="debug-muted">
        {selection
          ? selection.roi
            ? `选区：${selection.roi.join(', ')}`
            : `选点：${selection.point.x}, ${selection.point.y}`
          : '尚未选择坐标'}
      </p>
    </section>
  );
}
