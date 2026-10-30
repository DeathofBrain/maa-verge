import Checkbox from '@/kit/Checkbox';
import './select-all.css';

type Props = {
  label: string;
  total: number;
  selected: number;
  text?: string;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
};

export default function SelectAll({
  label,
  total,
  selected,
  text = '全选',
  disabled,
  onChange,
}: Props) {
  const checked = total > 0 && selected === total;
  const indeterminate = selected > 0 && selected < total;

  return (
    <label className="cp-select-all">
      <Checkbox
        aria-label={label}
        aria-checked={indeterminate ? 'mixed' : checked}
        checked={checked}
        disabled={disabled || total === 0}
        ref={(input) => {
          if (input) input.indeterminate = indeterminate;
        }}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      {text}
    </label>
  );
}
