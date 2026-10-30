import { cx } from './cx';

type Props = {
  value: number;
  max?: number;
  label: string;
  className?: string;
};

export default function ProgressBar({ value, max = 100, label, className }: Props) {
  return (
    <progress className={cx('mv-progress', className)} value={value} max={max} aria-label={label} />
  );
}
