import { useLayoutEffect, useRef, type RefObject } from 'react';
import { acquireModalEffects, type ModalOptions } from './modal-effects';

type Options = Omit<ModalOptions, 'panel' | 'native' | 'onEscape'> & {
  open?: boolean;
  onClose?: () => void;
  closeDisabled?: boolean;
};

/**
 * 保留浏览器管理的原生模态行为，并统一开关、取消和焦点租约。
 * open 在同一次打开期间保持租约，回调与取消门禁始终读取最新值。
 */
export default function useNativeDialog(
  ref: RefObject<HTMLDialogElement | null>,
  options: Options = {},
) {
  const { open = true } = options;
  const latest = useRef(options);
  latest.current = options;

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;
    const {
      onClose: _onClose,
      closeDisabled: _closeDisabled,
      open: _open,
      ...effects
    } = latest.current;
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const returnFocus =
      effects.returnFocus ?? (active !== document.body ? active : effects.fallbackFocus?.());
    const cancel = (event: Event) => {
      // The state owner closes the dialog after cancellation has been accepted.
      event.preventDefault();
      if (!latest.current.closeDisabled) latest.current.onClose?.();
    };
    if (!dialog.open) dialog.showModal();
    dialog.addEventListener('cancel', cancel);
    const release = acquireModalEffects({
      ...effects,
      panel: dialog,
      native: true,
      returnFocus,
      fallbackFocus: () => latest.current.fallbackFocus?.(),
    });
    return () => {
      dialog.removeEventListener('cancel', cancel);
      dialog.close();
      release();
    };
  }, [ref, open]);
}
