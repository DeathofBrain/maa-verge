// 提供跨页面的大号侧栏容器，焦点、遮罩和滚动锁仍由统一 Drawer 管理。
import type { ReactNode } from 'react';
import Drawer from '@/kit/Drawer';
import './side-drawer.css';

export default function SideDrawer({
  title,
  children,
  onClose,
  closeLabel = `关闭${title}`,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  closeLabel?: string;
}) {
  return (
    <Drawer
      title={title}
      onClose={onClose}
      closeLabel={closeLabel}
      backdropLabel={`${closeLabel}遮罩`}
      width="lg"
      layerClassName="side-drawer-layer"
      className="side-drawer-panel"
      backdropClassName="side-drawer-backdrop"
      headerClassName="side-drawer-heading"
      bodyClassName="side-drawer-content"
    >
      {children}
    </Drawer>
  );
}
