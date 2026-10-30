import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { acquireModalEffects, type ScrollLock } from '../modal-effects';
import IconButton from './IconButton';
import { cx } from './cx';

type Props = {
  kind: 'modal' | 'drawer';
  title: string;
  onClose: () => void;
  closeLabel?: string;
  closeDisabled?: boolean;
  busy?: boolean;
  background?: (HTMLElement | null)[];
  ariaHidden?: (HTMLElement | null)[];
  scroll?: ScrollLock[];
  initialFocus?: HTMLElement | null;
  returnFocus?: HTMLElement | null;
  fallbackFocus?: () => HTMLElement | null | undefined;
  className?: string;
  layerClassName?: string;
  backdropClassName?: string;
  bodyClassName?: string;
  children: ReactNode;
  footer?: ReactNode;
};

export default function Overlay({
  kind,
  title,
  onClose,
  closeLabel = `关闭${title}`,
  closeDisabled = false,
  busy = false,
  background,
  ariaHidden,
  scroll,
  initialFocus,
  returnFocus,
  fallbackFocus,
  className,
  layerClassName,
  backdropClassName,
  bodyClassName,
  children,
  footer,
}: Props) {
  const panel = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const blocked = useRef(false);
  blocked.current = busy;
  const label = useRef(closeLabel);
  label.current = closeLabel;

  useLayoutEffect(() => {
    const element = panel.current;
    if (!element) return;
    return acquireModalEffects({
      panel: element,
      layer: element.parentElement ?? undefined,
      background: background ?? [
        document.querySelector<HTMLElement>('.sidebar'),
        document.querySelector<HTMLElement>('.main-shell'),
        document.querySelector<HTMLElement>('.run-dock'),
      ],
      ariaHidden,
      scroll,
      initialFocus: initialFocus ?? element.querySelector<HTMLElement>('[data-autofocus]'),
      returnFocus: returnFocus ?? undefined,
      fallbackFocus,
      onEscape: () => {
        if (!blocked.current) close.current();
      },
    });
    // 背景与焦点目标在挂载时确定，后续重渲染沿用同一份 overlay 租约。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div className={cx('mv-overlay-layer', `mv-overlay-layer--${kind}`, layerClassName)}>
      <button
        className={cx('mv-overlay-backdrop', backdropClassName)}
        tabIndex={-1}
        aria-label={`${label.current}遮罩`}
        onClick={() => {
          if (!blocked.current) close.current();
        }}
      />
      <section
        ref={panel}
        className={cx(kind === 'modal' ? 'mv-modal' : 'mv-drawer', className)}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-busy={busy || undefined}
      >
        <header className="mv-overlay-title">
          <h2 className="mv-overlay-heading">{title}</h2>
          <IconButton
            label={closeLabel}
            data-autofocus={!initialFocus || undefined}
            disabled={closeDisabled}
            onClick={() => close.current()}
          >
            <X size={18} />
          </IconButton>
        </header>
        <div className={cx('mv-overlay-body', bodyClassName)}>{children}</div>
        {footer && <footer className="mv-overlay-actions">{footer}</footer>}
      </section>
    </div>,
    document.body,
  );
}
