import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type SelectHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import '../select.css';

type Option = { value: string; label: string; disabled: boolean; group?: string; index: number };
type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'multiple' | 'size'>;

// Keep the native control for labels, form values, validation and change events.
// Its popup is replaced so every desktop WebView uses the same themed menu.
export default function Select({ className = '', style, children, onChange, ...props }: Props) {
  const control = useRef<HTMLSelectElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const listId = useId();
  const search = useRef({ text: '', time: 0 });
  const [options, setOptions] = useState<Option[]>([]);
  const [selected, setSelected] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const sync = () => {
    const select = control.current;
    if (!select) return;
    if (select.matches(':disabled')) setOpen(false);
    const next = Array.from(select.options).flatMap((option, index) => {
      const group =
        option.parentElement instanceof HTMLOptGroupElement ? option.parentElement : null;
      return option.hidden || group?.hidden
        ? []
        : [
            {
              value: option.value,
              label: option.label,
              disabled: option.disabled || !!group?.disabled,
              group: group?.label,
              index,
            },
          ];
    });
    setOptions((previous) => (JSON.stringify(previous) === JSON.stringify(next) ? previous : next));
    setSelected(select.value);
  };
  useLayoutEffect(sync);

  const close = () => setOpen(false);
  const show = (last = false) => {
    if (!control.current || control.current.matches(':disabled')) return;
    const available = options.filter((option) => !option.disabled);
    const chosen = available.find((option) => option.value === control.current?.value);
    setActive((chosen ?? (last ? available.at(-1) : available[0]))?.index ?? -1);
    search.current = { text: '', time: 0 };
    setOpen(true);
  };
  const choose = (option: Option) => {
    const select = control.current;
    if (!select || select.matches(':disabled') || option.disabled) return;
    if (select.value !== option.value) {
      select.value = option.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    close();
    select.focus({ preventScroll: true });
  };

  useLayoutEffect(() => {
    if (!open || !menu.current || !control.current) return;
    const popup = menu.current;
    const select = control.current;
    if ('showPopover' in popup) popup.showPopover();
    const position = () => {
      const rect = select.getBoundingClientRect();
      const viewport = window.visualViewport;
      const left = viewport?.offsetLeft ?? 0;
      const top = viewport?.offsetTop ?? 0;
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      const below = top + height - rect.bottom - 14;
      const above = rect.top - top - 14;
      const up = below < Math.min(popup.scrollHeight, 280) && above > below;
      popup.style.maxHeight = `${Math.max(48, Math.min(320, up ? above : below))}px`;
      popup.style.minWidth = `${Math.min(rect.width, width - 16)}px`;
      popup.style.maxWidth = `${width - 16}px`;
      const bounds = popup.getBoundingClientRect();
      popup.style.left = `${Math.max(left + 8, Math.min(rect.left, left + width - bounds.width - 8))}px`;
      popup.style.top = `${Math.max(top + 8, up ? rect.top - bounds.height - 6 : rect.bottom + 6)}px`;
      popup.dataset.side = up ? 'top' : 'bottom';
    };
    position();
    const observer = new ResizeObserver(position);
    observer.observe(select);
    const scroll = (event: Event) => {
      if (!popup.contains(event.target as Node)) position();
    };
    window.addEventListener('resize', position);
    document.addEventListener('scroll', scroll, true);
    window.visualViewport?.addEventListener('resize', position);
    window.visualViewport?.addEventListener('scroll', position);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', position);
      document.removeEventListener('scroll', scroll, true);
      window.visualViewport?.removeEventListener('resize', position);
      window.visualViewport?.removeEventListener('scroll', position);
    };
  }, [open, options]);

  useEffect(() => {
    if (!open) return;
    if (!options.some((option) => option.index === active && !option.disabled)) {
      setActive(options.find((option) => !option.disabled)?.index ?? -1);
    }
    menu.current
      ?.querySelector<HTMLElement>(`[data-option-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [open, active, options]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!control.current?.parentElement?.contains(target) && !menu.current?.contains(target))
        close();
    };
    const dismiss = () => close();
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('blur', dismiss);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('blur', dismiss);
    };
  }, [open]);

  useEffect(() => {
    if (props.disabled) close();
  }, [props.disabled]);

  const keydown = (event: KeyboardEvent<HTMLSelectElement>) => {
    props.onKeyDown?.(event);
    if (event.defaultPrevented) return;
    if (event.key === 'F4' && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      if (open) close();
      else show();
      return;
    }
    if (event.key === 'Tab') {
      close();
      return;
    }
    if (event.key === 'Escape') {
      if (open) {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
      return;
    }
    if (['Enter', ' ', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      if (event.key === 'Enter' || event.key === ' ') {
        if (!open) show();
        else {
          const option = options.find((item) => item.index === active);
          if (option) choose(option);
        }
      } else if (event.altKey && event.key === 'ArrowUp') close();
      else if (!open) {
        show(event.key === 'ArrowUp');
        if (event.key === 'Home' || event.key === 'End') {
          const available = options.filter((option) => !option.disabled);
          setActive((event.key === 'End' ? available.at(-1) : available[0])?.index ?? -1);
        }
      } else {
        const available = options.filter((option) => !option.disabled);
        const index = available.findIndex((option) => option.index === active);
        const next =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? available.length - 1
              : Math.max(
                  0,
                  Math.min(available.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)),
                );
        setActive(available[next]?.index ?? -1);
      }
      return;
    }
    if (
      event.key.length !== 1 ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.nativeEvent.isComposing
    )
      return;
    event.preventDefault();
    if (!open) show();
    const now = Date.now();
    search.current = {
      text: now - search.current.time < 700 ? search.current.text + event.key : event.key,
      time: now,
    };
    const text = search.current.text.toLocaleLowerCase();
    const prefix = [...text].every((letter) => letter === text[0]) ? text[0] : text;
    const start = options.findIndex((option) => option.index === active);
    const ordered = [...options.slice(start + 1), ...options.slice(0, start + 1)];
    const match = ordered.find(
      (option) => !option.disabled && option.label.trim().toLocaleLowerCase().startsWith(prefix),
    );
    if (match) setActive(match.index);
  };
  const labelElement =
    open && !props['aria-label']
      ? (control.current?.labels?.[0]?.cloneNode(true) as HTMLElement | undefined)
      : undefined;
  labelElement?.querySelectorAll('select, [aria-hidden="true"]').forEach((node) => node.remove());
  const label = props['aria-label'] || labelElement?.textContent?.trim() || '选择选项';
  const selectedOption = options.find((option) => option.value === selected);

  return (
    <span className={`app-select ${className}`} style={style} data-open={open || undefined}>
      <select
        {...props}
        className="app-select-native"
        ref={control}
        title={props.title ?? selectedOption?.label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        onPointerDown={(event) => {
          props.onPointerDown?.(event);
          event.preventDefault();
          event.currentTarget.focus({ preventScroll: true });
        }}
        onClick={(event) => {
          props.onClick?.(event);
          event.preventDefault();
          if (open) close();
          else show();
        }}
        onKeyDown={keydown}
        onBlur={(event) => {
          props.onBlur?.(event);
          close();
        }}
        onChange={(event) => {
          sync();
          close();
          onChange?.(event);
        }}
      >
        {children}
      </select>
      <span className="app-select-value" aria-hidden="true">
        {selectedOption?.label || '\u00a0'}
      </span>
      <ChevronDown className="app-select-chevron" size={15} aria-hidden="true" />
      {open &&
        createPortal(
          <div
            ref={menu}
            id={listId}
            className="app-select-menu"
            data-select-menu=""
            popover={typeof HTMLElement.prototype.showPopover === 'function' ? 'manual' : undefined}
            role="listbox"
            aria-label={label}
            onPointerDown={(event) => event.preventDefault()}
          >
            {options.map((option, index) => (
              <div key={option.index} role="presentation">
                {option.group && option.group !== options[index - 1]?.group && (
                  <div className="app-select-group" role="presentation">
                    {option.group}
                  </div>
                )}
                <div
                  id={`${listId}-${option.index}`}
                  role="option"
                  aria-selected={option.value === selected}
                  aria-disabled={option.disabled || undefined}
                  className="app-select-option"
                  data-value={option.value}
                  data-option-index={option.index}
                  data-active={option.index === active || undefined}
                  onPointerMove={() => {
                    if (!option.disabled) setActive(option.index);
                  }}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    choose(option);
                  }}
                >
                  <span>{option.label}</span>
                  {option.value === selected && <Check size={15} aria-hidden="true" />}
                </div>
              </div>
            ))}
            {!options.length && <div className="app-select-empty">暂无可选项</div>}
          </div>,
          control.current?.closest('dialog, [role="dialog"]') ?? document.body,
        )}
    </span>
  );
}
