import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { acquireModalEffects, type ScrollLock } from './modal-effects';
import IconButton from './IconButton';
import { cx } from './cx';

type Props = {
  title: string;
  onClose: () => void;
  width?: 'md' | 'lg';
  closeLabel?: string;
  closeDisabled?: boolean;
  busy?: boolean;
  dockOffset?: boolean;
  header?: ReactNode | false;
  headerClassName?: string;
  bodyClassName?: string;
  bodyScroll?: boolean;
  backdropLabel?: string;
  background?: (HTMLElement | null)[];
  ariaHidden?: (HTMLElement | null)[];
  scroll?: ScrollLock[];
  initialFocus?: HTMLElement | null;
  initialFocusSelector?: string;
  returnFocus?: HTMLElement | null;
  fallbackFocus?: () => HTMLElement | null | undefined;
  className?: string;
  layerClassName?: string;
  backdropClassName?: string;
  footer?: ReactNode;
  children: ReactNode;
};

export default function Drawer({
  title,
  onClose,
  width = 'md',
  closeLabel = `关闭${title}`,
  closeDisabled = false,
  busy = false,
  dockOffset = false,
  header,
  headerClassName,
  bodyClassName,
  bodyScroll = true,
  backdropLabel = `${closeLabel}遮罩`,
  background,
  ariaHidden,
  scroll,
  initialFocus,
  initialFocusSelector,
  returnFocus,
  fallbackFocus,
  className,
  layerClassName,
  backdropClassName,
  footer,
  children,
}: Props) {
  const panel = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const blocked = useRef(false);
  blocked.current = busy;

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
      initialFocus:
        initialFocus ??
        element.querySelector<HTMLElement>(initialFocusSelector ?? '[data-autofocus]'),
      returnFocus: returnFocus ?? undefined,
      fallbackFocus,
      onEscape: () => {
        if (!blocked.current) close.current();
      },
    });
    // 背景、滚动锁与焦点目标在挂载时确定，后续重渲染沿用同一份 overlay 租约。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div
      className={cx(
        'mv-overlay-layer',
        'mv-overlay-layer--drawer',
        dockOffset && 'mv-overlay-layer--drawer-docked',
        layerClassName,
      )}
    >
      <button
        className={cx('mv-overlay-backdrop', backdropClassName)}
        tabIndex={-1}
        aria-label={backdropLabel}
        onClick={() => {
          if (!blocked.current) close.current();
        }}
      />
      <section
        ref={panel}
        className={cx('mv-drawer', `mv-drawer--${width}`, className)}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-busy={busy || undefined}
      >
        {header === false ? null : header !== undefined ? (
          <div className={cx('mv-drawer-header', headerClassName)}>{header}</div>
        ) : (
          <header className={cx('mv-drawer-header', headerClassName)}>
            <h2 className="mv-overlay-heading">{title}</h2>
            <IconButton
              label={closeLabel}
              data-autofocus={!initialFocus && !initialFocusSelector ? true : undefined}
              disabled={closeDisabled}
              onClick={() => close.current()}
            >
              <X size={18} />
            </IconButton>
          </header>
        )}
        <div
          className={cx('mv-drawer-body', !bodyScroll && 'mv-drawer-body--static', bodyClassName)}
        >
          {children}
        </div>
        {footer && <footer className="mv-drawer-actions">{footer}</footer>}
      </section>
    </div>,
    document.body,
  );
}
