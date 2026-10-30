import { cx } from './cx';

type Props = {
  value: number;
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  label: string;
  className?: string;
};

export default function ProgressBar({ value, max = 100, size = 'md', label, className }: Props) {
  return (
    <progress
      className={cx('mv-progress', size !== 'md' && `mv-progress--${size}`, className)}
      value={value}
      max={max}
      aria-label={label}
    />
  );
}
