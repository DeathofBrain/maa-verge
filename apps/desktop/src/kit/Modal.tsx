import type { ReactNode } from 'react';
import Overlay from './Overlay';
import { cx } from './cx';

type Props = {
  title: string;
  onClose: () => void;
  closeLabel?: string;
  closeDisabled?: boolean;
  busy?: boolean;
  background?: (HTMLElement | null)[];
  initialFocus?: HTMLElement | null;
  initialFocusSelector?: string;
  returnFocus?: HTMLElement | null;
  fallbackFocus?: () => HTMLElement | null | undefined;
  width?: 'sm' | 'md';
  className?: string;
  layerClassName?: string;
  backdropClassName?: string;
  bodyClassName?: string;
  footer?: ReactNode;
  children: ReactNode;
};

export default function Modal({ width = 'md', className, ...rest }: Props) {
  return (
    <Overlay
      kind="modal"
      className={cx(width !== 'md' && `mv-modal--${width}`, className)}
      {...rest}
    />
  );
}
