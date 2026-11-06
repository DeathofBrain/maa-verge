// 旋转图标只作装饰，操作名称与忙碌状态由外层控件提供。
import { LoaderCircle } from 'lucide-react';
import { cx } from './cx';

type Props = {
  size?: number;
  className?: string;
};

export default function Spinner({ size = 17, className }: Props) {
  return <LoaderCircle size={size} className={cx('spin', className)} aria-hidden="true" />;
}
