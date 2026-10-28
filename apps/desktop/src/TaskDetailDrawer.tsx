import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { acquireModalEffects } from './modal-effects';
import { X } from 'lucide-react';
import './task-center.css';

export default function TaskDetailDrawer({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useLayoutEffect(() => {
    if (!panel.current) return;
    return acquireModalEffects({
      panel: panel.current,
      layer: panel.current.parentElement ?? undefined,
      background: [
        document.querySelector<HTMLElement>('.sidebar'),
        document.querySelector<HTMLElement>('.main-shell'),
        document.querySelector<HTMLElement>('.run-dock'),
      ],
      initialFocus: panel.current.querySelector<HTMLElement>('[data-autofocus]'),
      onEscape: () => close.current(),
    });
  }, []);
  return createPortal(
    <div className="tc-drawer-layer">
      <button
        className="tc-drawer-backdrop"
        tabIndex={-1}
        aria-label="关闭任务表详情遮罩"
        onClick={() => close.current()}
      />
      <div
        className="tc-drawer-panel"
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="任务表详情"
      >
        <div className="tc-drawer-bar">
          <span>任务表详情</span>
          <button
            className="icon-button"
            data-autofocus
            aria-label="关闭任务表详情"
            onClick={() => close.current()}
          >
            <X size={18} />
          </button>
        </div>
        <div className="tc-drawer-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
