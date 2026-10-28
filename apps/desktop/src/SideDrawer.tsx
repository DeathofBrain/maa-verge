import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { acquireModalEffects } from './modal-effects';
import './side-drawer.css';

export default function SideDrawer({
  title,
  children,
  onClose,
  closeLabel = `关闭${title}`,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  closeLabel?: string;
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
      onEscape: () => close.current(),
    });
  }, []);
  return createPortal(
    <div className="side-drawer-layer">
      <button
        className="side-drawer-backdrop"
        tabIndex={-1}
        aria-label={`${closeLabel}遮罩`}
        onClick={() => close.current()}
      />
      <div
        ref={panel}
        className="side-drawer-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="side-drawer-heading">
          <strong>{title}</strong>
          <button className="icon-button" aria-label={closeLabel} onClick={() => close.current()}>
            <X size={18} />
          </button>
        </header>
        <div className="side-drawer-content">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
