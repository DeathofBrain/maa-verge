import { useState, type ComponentPropsWithRef, type ReactNode } from 'react';
import { ExternalLink as ExternalLinkIcon } from 'lucide-react';
import { errorMessage, openExternalUrl } from '@maaverge/contracts';
import { cx } from './cx';

type Props = Omit<ComponentPropsWithRef<'a'>, 'href' | 'children' | 'target' | 'rel'> & {
  href: string;
  children: ReactNode;
  onOpenError?: (cause: unknown) => void;
};

export default function ExternalLink({
  href,
  children,
  onClick,
  onAuxClick,
  onOpenError,
  className,
  ...rest
}: Props) {
  const [error, setError] = useState('');

  const open = async () => {
    setError('');
    try {
      await openExternalUrl(href);
    } catch (cause) {
      if (onOpenError) {
        try {
          await onOpenError(cause);
        } catch (handlerCause) {
          setError(errorMessage(handlerCause));
        }
      } else {
        setError(errorMessage(cause));
      }
    }
  };

  return (
    <>
      <a
        {...rest}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cx('mv-external-link', className)}
        onClick={(event) => {
          onClick?.(event);
          if (event.defaultPrevented) return;
          event.preventDefault();
          void open();
        }}
        onAuxClick={(event) => {
          onAuxClick?.(event);
          if (event.defaultPrevented || event.button !== 1) return;
          event.preventDefault();
          void open();
        }}
      >
        {children}
        <ExternalLinkIcon className="mv-external-link-icon" size={11} aria-hidden="true" />
      </a>
      {error && (
        <span className="mv-external-link-error" role="alert">
          {error}
        </span>
      )}
    </>
  );
}
