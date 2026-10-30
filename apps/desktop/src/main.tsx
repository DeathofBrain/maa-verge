import React from 'react';
import ReactDOM from 'react-dom/client';
// kit.css 必须是模块图中第一个样式表：Vite 按依赖遍历顺序合并 CSS，
// 只有排在所有页面样式之前，宿主页面对 .mv-* 根类的单类覆盖才能靠源顺序取胜。
import './kit/kit.css';
import App from './app/App';
import DesktopLifecycleDialog from './app/shell/DesktopLifecycle';
import { ContextMenuProvider } from './kit/ContextMenu';
import '@fontsource-variable/noto-sans-sc/wght.css';
import './app/styles/styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ContextMenuProvider>
      <App />
      <DesktopLifecycleDialog />
    </ContextMenuProvider>
  </React.StrictMode>,
);
