import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import DesktopLifecycleDialog from './DesktopLifecycle';
import '@fontsource-variable/noto-sans-sc/wght.css';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /><DesktopLifecycleDialog /></React.StrictMode>,
);
