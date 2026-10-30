import IconButton from '@/kit/IconButton';
import SearchField from '@/kit/SearchField';
import type { RefObject } from 'react';
import { ArrowRight, Menu, Monitor, Search, Settings2 } from 'lucide-react';
import type { Device } from '@maaverge/contracts';
import WindowControls from './WindowControls';
import { navigation, type Page } from '@/app/model/navigation-model';

type SearchResult = { key: string; title: string; location: string; open: () => void };

type SidebarProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  page: Page;
  navigate: (page: Page) => void;
  onTasks: (view: 'plans') => void;
  onClearExecution: (id: undefined) => void;
  device?: Device;
  appVersion: string;
  hasUpdate: boolean;
};

export function AppSidebar({
  open,
  onOpenChange,
  page,
  navigate,
  onTasks,
  onClearExecution,
  device,
  appVersion,
  hasUpdate,
}: SidebarProps) {
  return (
    <>
      {open && (
        <button className="nav-scrim" aria-label="关闭导航" onClick={() => onOpenChange(false)} />
      )}
      <aside className="sidebar">
        <Brand />
        <nav aria-label="主导航" className="primary-nav">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              className={`nav-item ${page === id ? 'active' : ''}`}
              aria-current={page === id ? 'page' : undefined}
              key={id}
              onClick={() => {
                if (id === 'tasks') {
                  onTasks('plans');
                  onClearExecution(undefined);
                }
                navigate(id);
              }}
            >
              <Icon size={19} />
              <span>{label}</span>
              {id === 'agent' && <span className="subtle-tag">预览</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className={`nav-item ${page === 'devices' ? 'active' : ''}`}
            aria-current={page === 'devices' ? 'page' : undefined}
            onClick={() => navigate('devices')}
          >
            <Monitor size={19} />
            <span>设备</span>
            <span
              className={`status-dot ${!device || device.state === 'offline' ? 'offline' : ''}`}
            />
          </button>
          <button
            className={`nav-item ${page === 'settings' ? 'active' : ''}`}
            aria-current={page === 'settings' ? 'page' : undefined}
            onClick={() => navigate('settings')}
          >
            <Settings2 size={19} />
            <span>设置</span>
            {hasUpdate && <span className="update-dot" />}
          </button>
          <div className="sidebar-footer">
            <span>Maa Verge {appVersion}</span>
          </div>
        </div>
      </aside>
    </>
  );
}

type TopbarProps = {
  searchInput: RefObject<HTMLInputElement | null>;
  search: string;
  setSearch: (value: string) => void;
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  searchResults: SearchResult[];
  onOpenNav: () => void;
};

export function AppTopbar({
  searchInput,
  search,
  setSearch,
  searchOpen,
  setSearchOpen,
  searchResults,
  onOpenNav,
}: TopbarProps) {
  return (
    <>
      <header className="topbar" data-tauri-drag-region="deep">
        <div className="workspace-context">
          <IconButton className="mobile-menu" label="打开导航" onClick={onOpenNav}>
            <Menu size={20} />
          </IconButton>
          <div className="global-search" data-tauri-drag-region="false">
            <SearchField
              variant="inline"
              ref={searchInput}
              aria-label="搜索任务与设置"
              placeholder="搜索任务与设置"
              value={search}
              onFocus={() => setSearchOpen(true)}
              onValueChange={(value) => {
                setSearch(value);
                setSearchOpen(true);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && searchResults[0]) {
                  searchResults[0].open();
                  setSearchOpen(false);
                }
              }}
            />
            {searchOpen && search.trim() && (
              <>
                <button
                  className="search-dismiss"
                  aria-label="关闭搜索结果"
                  onClick={() => setSearchOpen(false)}
                />
                <div className="search-results" role="region" aria-label="搜索结果">
                  {searchResults.length ? (
                    searchResults.map((item) => (
                      <button
                        key={item.key}
                        onClick={() => {
                          item.open();
                          setSearchOpen(false);
                        }}
                      >
                        <Search size={14} />
                        <span>
                          {item.title}
                          <small>{item.location}</small>
                        </span>
                        <ArrowRight size={14} />
                      </button>
                    ))
                  ) : (
                    <p>没有找到匹配项，试试“更新”或任务名称。</p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
        <div className="topbar-actions">
          <WindowControls />
        </div>
      </header>
    </>
  );
}

export function Brand() {
  return (
    <div className="brand" data-tauri-drag-region="deep">
      <span className="brand-mark" aria-hidden="true">
        <img src="/logo.png" width="32" height="32" alt="" draggable={false} />
      </span>
      <span>Maa Verge</span>
    </div>
  );
}
