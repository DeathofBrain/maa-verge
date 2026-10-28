import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
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
    const sidebar = document.querySelector<HTMLElement>('.sidebar');
    const shell = document.querySelector<HTMLElement>('.main-shell');
    const previous = [sidebar?.inert ?? false, shell?.inert ?? false] as const;
    const previousOverflow = document.body.style.overflow;
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (sidebar) sidebar.inert = true;
    if (shell) shell.inert = true;
    document.body.style.overflow = 'hidden';
    panel.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true });
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (document.querySelector('.app-context-menu')) return;
        event.preventDefault();
        event.stopPropagation();
        close.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const targets = [
        ...(panel.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[tabindex="0"]',
        ) ?? []),
      ].filter((target) => !target.closest('[hidden]') && target.getClientRects().length > 0);
      const first = targets[0],
        last = targets.at(-1);
      if (!first) {
        event.preventDefault();
        return;
      }
      if (
        event.shiftKey &&
        (!targets.includes(document.activeElement as HTMLElement) ||
          document.activeElement === first)
      ) {
        event.preventDefault();
        last?.focus();
      } else if (
        !event.shiftKey &&
        (!targets.includes(document.activeElement as HTMLElement) ||
          document.activeElement === last)
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', keydown, true);
    return () => {
      document.removeEventListener('keydown', keydown, true);
      if (sidebar) sidebar.inert = previous[0];
      if (shell) shell.inert = previous[1];
      document.body.style.overflow = previousOverflow;
      if (active?.isConnected) active.focus({ preventScroll: true });
    };
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
