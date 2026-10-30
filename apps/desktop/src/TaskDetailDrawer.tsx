import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import Drawer from './kit/Drawer';
import IconButton from './kit/IconButton';
import './task-center.css';

export default function TaskDetailDrawer({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <Drawer
      title="任务表详情"
      onClose={onClose}
      closeLabel="关闭任务表详情"
      backdropLabel="关闭任务表详情遮罩"
      width="md"
      dockOffset
      layerClassName="tc-drawer-layer"
      className="tc-drawer-panel"
      backdropClassName="tc-drawer-backdrop"
      headerClassName="tc-drawer-bar"
      bodyClassName="tc-drawer-body"
      header={
        <>
          <span>任务表详情</span>
          <IconButton label="关闭任务表详情" data-autofocus onClick={onClose}>
            <X size={18} />
          </IconButton>
        </>
      }
    >
      {children}
    </Drawer>
  );
}
