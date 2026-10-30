import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronUp, Monitor } from 'lucide-react';
import type { Device } from '@maaverge/contracts';
import './device-picker.css';

export default function DevicePicker({
  devices,
  value,
  onChange,
}: {
  devices: Device[];
  value: string;
  onChange: (id: string) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const selected = devices.find((device) => device.id === value);
  const selectedIndex = devices.findIndex((device) => device.id === value);
  const activeIndex = Math.min(active, devices.length - 1);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  useEffect(() => {
    if (open)
      root.current
        ?.querySelector<HTMLElement>(`[data-option-index="${activeIndex}"]`)
        ?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex]);

  const show = (index = selectedIndex >= 0 ? selectedIndex : 0) => {
    setActive(index);
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  };
  const choose = (id: string) => {
    onChange(id);
    close();
  };
  const keydown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Tab') {
      setOpen(false);
      return;
    }
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) show();
      else if (devices.length)
        setActive(
          (activeIndex + (event.key === 'ArrowDown' ? 1 : -1) + devices.length) % devices.length,
        );
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      show(event.key === 'Home' ? 0 : Math.max(0, devices.length - 1));
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!open) show();
      else if (devices[activeIndex]) choose(devices[activeIndex].id);
    }
  };

  return (
    <div
      className="dock-device-picker"
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        className="dock-device-trigger"
        ref={trigger}
        type="button"
        role="combobox"
        aria-label="选择设备"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        data-value={value}
        onClick={() => (open ? close() : show())}
        onKeyDown={keydown}
      >
        <Monitor size={16} aria-hidden="true" />
        <span>{selected?.name || (devices.length ? '选择设备' : '未连接设备')}</span>
        <ChevronUp size={14} aria-hidden="true" />
      </button>
      {open && (
        <div className="dock-device-menu" id={listId} role="listbox" aria-label="设备列表">
          {devices.length ? (
            devices.map((device, index) => (
              <button
                type="button"
                role="option"
                className={`dock-device-option ${index === activeIndex ? 'is-active' : ''}`}
                key={device.id}
                id={`${listId}-${index}`}
                tabIndex={-1}
                aria-selected={device.id === value}
                data-value={device.id}
                data-option-index={index}
                onPointerMove={() => setActive(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(device.id)}
              >
                <Monitor size={16} aria-hidden="true" />
                <span>
                  <strong>{device.name}</strong>
                  {device.address && <small>{device.address}</small>}
                </span>
                {device.id === value && <Check size={16} aria-hidden="true" />}
              </button>
            ))
          ) : (
            <p className="dock-device-empty">暂无设备，请先添加并连接设备。</p>
          )}
        </div>
      )}
    </div>
  );
}
