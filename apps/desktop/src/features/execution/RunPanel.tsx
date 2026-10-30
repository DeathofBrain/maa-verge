import IconButton from '@/kit/IconButton';
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import './run-panel.css';

export default function RunPanel({
  title,
  deviceName,
  children,
  onClose,
}: {
  title: string;
  deviceName?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const panel = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const previous = document.activeElement;
    panel.current?.focus({ preventScroll: true });
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus({ preventScroll: true });
    };
  }, []);
  return (
    <section id="run-panel" ref={panel} className="run-panel" aria-label="运行面板" tabIndex={-1}>
      <header className="run-panel-heading">
        <strong>{title}</strong>
        {deviceName && <span>{deviceName}</span>}
        <IconButton label="收起运行详情" onClick={onClose}>
          <ChevronDown size={18} />
        </IconButton>
      </header>
      <div className="run-panel-content">{children}</div>
    </section>
  );
}
