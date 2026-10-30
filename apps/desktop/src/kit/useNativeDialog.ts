import { useLayoutEffect, type RefObject } from 'react';
import { acquireModalEffects } from '../modal-effects';

/**
 * 原生 <dialog showModal> 的焦点与 Escape 辅助。
 * 这些弹层必须在 React 卸载后仍存活（如关窗提示），因此不迁到 Modal/Drawer。
 */
export default function useNativeDialog(
  ref: RefObject<HTMLDialogElement | null>,
  options: { onClose?: () => void; background?: (HTMLElement | null)[] } = {},
) {
  const { onClose, background } = options;
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog || !dialog.open) return;
    return acquireModalEffects({
      panel: dialog,
      background,
      native: true,
      onEscape: onClose,
    });
  }, [ref, onClose, background]);
}
