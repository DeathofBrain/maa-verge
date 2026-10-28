import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import './context-menu.css';

export type MenuItem = { label: string; action: () => void; disabled?: boolean; danger?: boolean };
type Menu = { x: number; y: number; items: MenuItem[]; target: HTMLElement; label: string };
const Context = createContext<(menu: Menu | null) => void>(() => {});

export function useContextMenuShow() {
  return useContext(Context);
}

export function useContextMenu() {
  const show = useContext(Context);
  return (label: string, items: MenuItem[]) => ({
    onContextMenu: (event: MouseEvent<HTMLElement>) => {
      if ((event.target as HTMLElement).closest('input, textarea, [contenteditable="true"]'))
        return;
      event.preventDefault();
      event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
      show({
        x: event.clientX || rect.left,
        y: event.clientY || rect.bottom,
        target: event.currentTarget,
        items,
        label,
      });
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if ((event.target as HTMLElement).closest('input, textarea, [contenteditable="true"]'))
        return;
      if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
      show({ x: rect.left, y: rect.bottom, target: event.target as HTMLElement, items, label });
    },
  });
}

export function ContextMenuProvider({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState<Menu | null>(null);
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!menu || !root.current) return;
    const element = root.current;
    const rect = element.getBoundingClientRect();
    element.style.left = `${Math.max(8, Math.min(menu.x, window.innerWidth - rect.width - 8))}px`;
    element.style.top = `${Math.max(8, Math.min(menu.y, window.innerHeight - rect.height - 8))}px`;
    element
      .querySelector<HTMLButtonElement>('button:not(:disabled)')
      ?.focus({ preventScroll: true });
  }, [menu]);
  useEffect(() => {
    if (!menu) return;
    const close = (event: Event) => {
      if (!root.current?.contains(event.target as Node)) setMenu(null);
    };
    const dismiss = () => setMenu(null);
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('resize', dismiss);
    window.addEventListener('blur', dismiss);
    document.addEventListener('wheel', dismiss, true);
    document.addEventListener('touchmove', dismiss, true);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('blur', dismiss);
      document.removeEventListener('wheel', dismiss, true);
      document.removeEventListener('touchmove', dismiss, true);
    };
  }, [menu]);
  return (
    <Context.Provider value={setMenu}>
      <div
        className="context-menu-scope"
        onContextMenu={(event) => {
          if (
            !(event.target as HTMLElement).closest('input, textarea, [contenteditable="true"]') &&
            !window.getSelection()?.toString()
          )
            event.preventDefault();
          setMenu(null);
        }}
      >
        {children}
      </div>
      {menu &&
        createPortal(
          <div
            ref={root}
            className="app-context-menu"
            role="menu"
            aria-label={menu.label}
            style={{ left: menu.x, top: menu.y }}
            onContextMenu={(event) => event.preventDefault()}
            onKeyDown={(event) => {
              const buttons = Array.from(
                root.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || [],
              );
              const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
              if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
                event.preventDefault();
                buttons[
                  event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? buttons.length - 1
                      : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) %
                        buttons.length
                ]?.focus();
              }
              if (event.key === 'Escape' || event.key === 'Tab') {
                event.preventDefault();
                setMenu(null);
                menu.target.focus();
              }
            }}
          >
            {menu.items.map((item) => (
              <button
                role="menuitem"
                key={item.label}
                disabled={item.disabled}
                className={item.danger ? 'is-danger' : undefined}
                onClick={() => {
                  setMenu(null);
                  item.action();
                }}
              >
                {item.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </Context.Provider>
  );
}
