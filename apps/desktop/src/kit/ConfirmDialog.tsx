import type { ReactNode } from 'react';
import Button from './Button';
import Overlay from './Overlay';

type Props = {
  title: string;
  onClose: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  cancelLabel?: string;
  confirmIcon?: ReactNode;
  confirmDisabled?: boolean;
  cancelDisabled?: boolean;
  busy?: boolean;
  danger?: boolean;
  closeLabel?: string;
  closeDisabled?: boolean;
  className?: string;
  layerClassName?: string;
  backdropClassName?: string;
  bodyClassName?: string;
  background?: (HTMLElement | null)[];
  initialFocus?: HTMLElement | null;
  initialFocusSelector?: string;
  returnFocus?: HTMLElement | null;
  fallbackFocus?: () => HTMLElement | null | undefined;
  children?: ReactNode;
};

export default function ConfirmDialog({
  title,
  onClose,
  onConfirm,
  confirmLabel,
  cancelLabel = '取消',
  confirmIcon,
  confirmDisabled = false,
  cancelDisabled = false,
  busy = false,
  danger = false,
  closeLabel,
  closeDisabled = false,
  className,
  layerClassName,
  backdropClassName,
  bodyClassName,
  background,
  initialFocus,
  initialFocusSelector,
  returnFocus,
  fallbackFocus,
  children,
}: Props) {
  return (
    <Overlay
      kind="modal"
      title={title}
      onClose={onClose}
      closeLabel={closeLabel}
      closeDisabled={closeDisabled}
      busy={busy}
      background={background}
      initialFocus={initialFocus}
      initialFocusSelector={initialFocusSelector}
      returnFocus={returnFocus}
      fallbackFocus={fallbackFocus}
      className={className}
      layerClassName={layerClassName}
      backdropClassName={backdropClassName}
      bodyClassName={bodyClassName}
      footer={
        <>
          <Button disabled={cancelDisabled} onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            icon={confirmIcon}
            busy={busy}
            disabled={confirmDisabled}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Overlay>
  );
}
