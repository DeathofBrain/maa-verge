import '@/kit/kit.css';
import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BookOpen, Plus, RefreshCw } from 'lucide-react';
import Button from '@/kit/Button';
import CheckField from '@/kit/CheckField';
import { ContextMenuProvider, useContextMenu } from '@/kit/ContextMenu';
import Drawer from '@/kit/Drawer';
import EmptyState from '@/kit/EmptyState';
import Field from '@/kit/Field';
import FilterChips from '@/kit/FilterChips';
import IconButton from '@/kit/IconButton';
import Modal from '@/kit/Modal';
import Notice from '@/kit/Notice';
import PageHeading from '@/kit/PageHeading';
import ProgressBar from '@/kit/ProgressBar';
import SearchField from '@/kit/SearchField';
import Section from '@/kit/Section';
import Select from '@/kit/Select';
import SettingRow from '@/kit/SettingRow';
import StatusPill, { type StatusTone } from '@/kit/StatusPill';
import Switch from '@/kit/Switch';
import Tabs from '@/kit/Tabs';
import TextField from '@/kit/TextField';
import '@fontsource-variable/noto-sans-sc/wght.css';
import '@/app/styles/styles.css';
import './kit-preview.css';

const initialTheme =
  new URLSearchParams(location.search).get('theme') === 'dark' ? 'dark' : 'light';
document.documentElement.dataset.theme = initialTheme;
const tabs = [
  { id: 'overview', label: '概览', count: 8 },
  { id: 'records', label: '执行记录', count: 12 },
  { id: 'disabled', label: '暂未开放', disabled: true },
];
const tones: [StatusTone, string][] = [
  ['neutral', '待命'],
  ['info', '提示'],
  ['running', '执行中'],
  ['success', '已完成'],
  ['warning', '待确认'],
  ['danger', '失败'],
  ['offline', '离线'],
];

function KitPreview() {
  const page = useRef<HTMLElement>(null);
  const [theme, setTheme] = useState(initialTheme);
  const [enabled, setEnabled] = useState(true);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('overview');
  const [filter, setFilter] = useState('all');
  const [overlay, setOverlay] = useState<'modal' | 'drawer' | null>(null);
  const [message, setMessage] = useState('点击按钮或右键菜单，即可查看交互反馈。');
  const contextMenu = useContextMenu();
  const close = () => setOverlay(null);
  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    setTheme(next);
  };

  return (
    <>
      <main ref={page} className="kit-preview-page">
        <PageHeading
          title="组件套装"
          icon={<BookOpen />}
          text="统一的界面原语 · 使用真实组件与设计令牌"
          actionsClassName="kit-preview-heading-actions"
          actions={
            <Button onClick={toggleTheme}>切换至{theme === 'light' ? '深色' : '浅色'}</Button>
          }
        />
        <div className="kit-preview-grid">
          <Section title="按钮与操作" description="四种变体、尺寸与交互状态" variant="card">
            <div className="kit-preview-stack">
              <div className="kit-preview-row">
                <Button
                  variant="primary"
                  icon={<Plus size={15} />}
                  onClick={() => setMessage('已触发主要操作。')}
                >
                  主要操作
                </Button>
                <Button onClick={() => setMessage('已触发次要操作。')}>次要操作</Button>
                <Button variant="danger" onClick={() => setMessage('已触发危险操作示例。')}>
                  危险操作
                </Button>
                <Button variant="text" onClick={() => setMessage('已触发文字操作。')}>
                  文字按钮
                </Button>
              </div>
              <div className="kit-preview-row">
                <Button size="sm">小尺寸</Button>
                <Button size="compact">紧凑尺寸</Button>
                <Button disabled>不可用</Button>
                <Button busy disabled>
                  处理中
                </Button>
                <IconButton label="刷新预览" onClick={() => setMessage('预览已刷新。')}>
                  <RefreshCw size={16} />
                </IconButton>
              </div>
              <Notice size="sm" tone="neutral">
                {message}
              </Notice>
            </div>
          </Section>
          <Section title="输入与选择" description="标签、帮助说明与错误状态" variant="card">
            <div className="kit-preview-stack">
              <div className="kit-preview-form">
                <Field label="名称" help="示例名称，仅用于预览。" id="preview-name">
                  {(id) => (
                    <TextField id={id} defaultValue="日常任务" aria-describedby={`${id}-help`} />
                  )}
                </Field>
                <Field label="更新偏好" id="preview-channel">
                  {(id) => (
                    <Select id={id} defaultValue="stable">
                      <option value="stable">稳定版</option>
                      <option value="preview">预览版</option>
                    </Select>
                  )}
                </Field>
                <Field label="必填项" error="请输入名称。" id="preview-invalid">
                  {(id) => <TextField id={id} invalid aria-invalid="true" placeholder="输入内容" />}
                </Field>
                <Field label="搜索" id="preview-search">
                  {(id) => (
                    <SearchField
                      id={id}
                      value={query}
                      onValueChange={setQuery}
                      placeholder="搜索组件"
                      clearLabel="清空搜索"
                    />
                  )}
                </Field>
              </div>
              <div className="kit-preview-row">
                <Select size="compact" aria-label="紧凑选择" defaultValue="compact">
                  <option value="compact">紧凑选择</option>
                  <optgroup label="更多选项">
                    <option value="available">可用选项</option>
                    <option value="disabled" disabled>
                      禁用选项
                    </option>
                  </optgroup>
                </Select>
                <Select size="sm" aria-label="小尺寸选择" defaultValue="small">
                  <option value="small">小尺寸</option>
                </Select>
                <Select variant="subtle" aria-label="弱化选择" defaultValue="subtle">
                  <option value="subtle">弱化样式</option>
                </Select>
                <Select disabled aria-label="禁用选择" defaultValue="disabled">
                  <option value="disabled">不可用</option>
                </Select>
              </div>
            </div>
          </Section>
          <Section title="设置与表单" description="通过 props 组合行与控件" variant="card">
            <div className="kit-preview-stack">
              <SettingRow
                title="启用提醒"
                description="标准设置行与默认尺寸开关。"
                control={<Switch checked={enabled} onChange={setEnabled} aria-label="启用提醒" />}
              />
              <SettingRow
                title="大尺寸开关"
                padding="compact"
                control={
                  <Switch
                    size="lg"
                    checked={!enabled}
                    onChange={(value) => setEnabled(!value)}
                    aria-label="大尺寸开关"
                  />
                }
              />
              <CheckField
                label="保留执行记录"
                description="复选框与说明文字组合。"
                defaultChecked
              />
            </div>
          </Section>
          <Section
            title="标签页与筛选"
            description="支持方向键、Home 与 End 切换标签"
            variant="card"
          >
            <div className="kit-preview-stack">
              <div className="kit-preview-scroll">
                <Tabs
                  items={tabs}
                  value={tab}
                  onChange={setTab}
                  idPrefix="preview"
                  aria-label="预览分类"
                />
              </div>
              {tabs
                .filter((item) => !item.disabled)
                .map((item) => (
                  <div
                    key={item.id}
                    id={`preview-panel-${item.id}`}
                    role="tabpanel"
                    aria-labelledby={`preview-tab-${item.id}`}
                    hidden={tab !== item.id}
                    className="kit-preview-panel"
                  >
                    {item.id === 'overview'
                      ? '当前展示组件概览，可切换至执行记录。'
                      : '这里展示执行记录的示例内容。'}
                  </div>
                ))}
              <FilterChips
                aria-label="预览筛选"
                items={[
                  { id: 'all', label: '全部', count: 12 },
                  { id: 'running', label: '执行中', count: 3 },
                  { id: 'done', label: '已完成', count: 9 },
                ]}
                value={filter}
                onChange={setFilter}
              />
            </div>
          </Section>
          <Section title="状态与反馈" description="语义色、提示信息与进度" variant="card">
            <div className="kit-preview-stack">
              <div className="kit-preview-row">
                {tones.map(([tone, label]) => (
                  <StatusPill key={tone} tone={tone} label={label} dot />
                ))}
              </div>
              <Notice tone="info">提示信息使用统一的语义色。</Notice>
              <Notice tone="warning" variant="banner">
                需要用户留意的事项。
              </Notice>
              <Notice tone="danger" size="sm">
                操作失败，请检查后重试。
              </Notice>
              <ProgressBar value={64} label="示例进度：64%" />
            </div>
          </Section>
          <Section title="空状态与弹层" description="点击查看弹窗、抽屉与右键菜单" variant="card">
            <div className="kit-preview-stack">
              <EmptyState
                variant="list"
                title="暂无内容"
                text="添加第一项后，会在这里显示。"
                action={
                  <Button size="sm" onClick={() => setOverlay('modal')}>
                    添加示例
                  </Button>
                }
              />
              <div className="kit-preview-row">
                <Button onClick={() => setOverlay('modal')}>打开弹窗</Button>
                <Button onClick={() => setOverlay('drawer')}>打开抽屉</Button>
              </div>
              <div
                className="kit-preview-menu"
                role="group"
                aria-label="右键菜单示例区域"
                tabIndex={0}
                {...contextMenu('示例菜单', [
                  { label: '复制示例', action: () => setMessage('已触发复制示例。') },
                  { label: '暂不可用', action: () => {}, disabled: true },
                  { label: '删除示例', action: () => setMessage('已触发删除示例。'), danger: true },
                ])}
              >
                在这里右键，或聚焦后按 Shift + F10
              </div>
            </div>
          </Section>
        </div>
        <p className="kit-preview-caption">
          以上内容均为合成示例，预览不连接业务服务。组件用法与维护约定见 kit/README.md。
        </p>
      </main>
      {overlay === 'modal' && (
        <Modal
          title="弹窗示例"
          onClose={close}
          background={[page.current]}
          width="sm"
          footer={
            <Button variant="primary" onClick={close}>
              完成
            </Button>
          }
        >
          <Notice>可用 Tab 切换焦点，按 Escape 或点击遮罩关闭。</Notice>
        </Modal>
      )}
      {overlay === 'drawer' && (
        <Drawer
          title="抽屉示例"
          onClose={close}
          background={[page.current]}
          footer={<Button onClick={close}>关闭抽屉</Button>}
        >
          <div className="kit-preview-stack">
            <Notice>背景暂不可交互，关闭后焦点返回触发按钮。</Notice>
            <Field label="抽屉内选择" id="preview-drawer-select">
              {(id) => (
                <Select id={id} defaultValue="one">
                  <option value="one">第一项</option>
                  <option value="two">第二项</option>
                </Select>
              )}
            </Field>
          </div>
        </Drawer>
      )}
    </>
  );
}

createRoot(document.getElementById('kit-preview')!).render(
  <ContextMenuProvider>
    <KitPreview />
  </ContextMenuProvider>,
);
