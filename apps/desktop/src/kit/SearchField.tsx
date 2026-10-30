import type { ComponentPropsWithRef, ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import { cx } from './cx';
import IconButton from './IconButton';

type Props = Omit<
  ComponentPropsWithRef<'input'>,
  'value' | 'defaultValue' | 'onChange' | 'size' | 'type' | 'children'
> & {
  value: string;
  onValueChange: (value: string) => void;
  onClear?: () => void;
  clearLabel?: string;
  icon?: ReactNode;
  id?: string;
  placeholder?: string;
  type?: 'text' | 'search';
  size?: 'md' | 'sm';
  variant?: 'field' | 'inline';
  'aria-label'?: string;
  className?: string;
};

export default function SearchField({
  value,
  onValueChange,
  onClear,
  clearLabel,
  icon,
  id,
  placeholder,
  type = 'text',
  size = 'md',
  variant = 'field',
  className,
  ...rest
}: Props) {
  return (
    <div
      className={cx(
        'mv-search',
        size !== 'md' && `mv-search--${size}`,
        variant === 'inline' && 'mv-search--inline',
        className,
      )}
    >
      <span className="mv-search-icon" aria-hidden="true">
        {icon ?? <Search size={15} />}
      </span>
      <input
        {...rest}
        id={id}
        type={type}
        className="mv-search-input"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onValueChange(event.target.value)}
      />
      {clearLabel && value !== '' && (
        <IconButton
          label={clearLabel}
          size="sm"
          onClick={() => (onClear ? onClear() : onValueChange(''))}
        >
          <X size={15} />
        </IconButton>
      )}
    </div>
  );
}
