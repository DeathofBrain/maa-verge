import TextField from '@/kit/TextField';
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { rpc, type RpcResult } from '@maaverge/contracts';
import './copilot-stage-filter.css';

type Catalog = RpcResult<'copilot.stages'>;
type Props = {
  value: string;
  onChange: (value: string) => void;
  onCommit: (value: string) => void;
  resourceKey: string;
};

export default function CopilotStageFilter({ value, onChange, onCommit, resourceKey }: Props) {
  const id = useId();
  const listId = `${id}-candidates`;
  const input = useRef<HTMLInputElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<CSSProperties>();
  const composing = useRef(false);
  const edited = useRef(false);
  const [catalog, setCatalog] = useState<{ key: string; result?: Catalog; failed?: boolean }>();
  const [revision, setRevision] = useState(0);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState('');
  const current = catalog?.key === resourceKey ? catalog : undefined;
  const stages = current?.result?.stages ?? [];
  const prefix = value.trim().toLowerCase();
  const matches = prefix
    ? stages.filter((stage) => stage.value.toLowerCase().startsWith(prefix))
    : [];
  const expanded = open && !!prefix;
  const activeIndex = matches.findIndex((stage) => stage.value === active);
  const canonical = (input: string) =>
    stages.find((stage) => stage.value.toLowerCase() === input.trim().toLowerCase())?.value;

  useEffect(() => {
    let cancelled = false;
    setCatalog({ key: resourceKey });
    void rpc('copilot.stages', {}).then(
      (result) => {
        if (!cancelled) setCatalog({ key: resourceKey, result });
      },
      () => {
        if (!cancelled) setCatalog({ key: resourceKey, failed: true });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [resourceKey, revision]);

  useLayoutEffect(() => {
    if (!expanded) return;
    const place = (event?: Event) => {
      if (event && list.current?.contains(event.target as Node)) return;
      const anchor = input.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const viewport = anchor.closest('.sp-page')?.getBoundingClientRect();
      const top = Math.max(8, (viewport?.top ?? 0) + 8);
      const bottom = Math.min(window.innerHeight - 8, (viewport?.bottom ?? window.innerHeight) - 8);
      if (rect.bottom < top || rect.top > bottom) {
        setOpen(false);
        return;
      }
      const below = Math.max(0, bottom - rect.bottom - 5);
      const above = Math.max(0, rect.top - top - 5);
      const height = popup.current?.getBoundingClientRect().height ?? 248;
      const down = below >= Math.min(248, height) || below >= above;
      setPosition({
        left: rect.left,
        width: rect.width,
        ...(down ? { top: rect.bottom + 5 } : { bottom: window.innerHeight - rect.top + 5 }),
        maxHeight: Math.min(248, down ? below : above),
      });
    };
    place();
    const observer = new ResizeObserver(() => place());
    if (input.current) {
      observer.observe(input.current);
      const viewport = input.current.closest('.sp-page');
      if (viewport) observer.observe(viewport);
    }
    window.addEventListener('resize', place);
    document.addEventListener('scroll', place, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', place);
      document.removeEventListener('scroll', place, true);
    };
  }, [expanded, matches.length, current?.failed, current?.result]);

  useEffect(() => {
    if (expanded && activeIndex >= 0)
      list.current?.children[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [expanded, activeIndex]);

  const select = (stage: string) => {
    edited.current = false;
    onChange(stage);
    onCommit(stage);
    setActive('');
    setOpen(false);
  };
  const change = (input: string) => {
    edited.current = true;
    onChange(input);
    setActive('');
    setOpen(true);
    const exact = canonical(input);
    if (!composing.current && (!input.trim() || exact)) onCommit(exact ?? '');
  };

  return (
    <div className="cp-field cp-stage-filter">
      <label htmlFor={id}>关卡筛选</label>
      <TextField
        id={id}
        ref={input}
        className="cp-input"
        role="combobox"
        aria-label="社区关卡筛选"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={expanded ? listId : undefined}
        aria-activedescendant={
          expanded && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined
        }
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={200}
        value={value}
        placeholder="例如 1-7"
        onChange={(event) => change(event.target.value)}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={(event) => {
          composing.current = false;
          change(event.currentTarget.value);
        }}
        onFocus={() => {
          setOpen(true);
          if (current?.failed) setRevision((previous) => previous + 1);
        }}
        onBlur={() => {
          setOpen(false);
          setActive('');
          if (!edited.current) return;
          edited.current = false;
          const exact = canonical(value);
          if (exact || ((current?.result || current?.failed) && !matches.length))
            onCommit(exact ?? value.trim());
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'Escape' && expanded) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
            setActive('');
          } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && matches.length) {
            event.preventDefault();
            const next =
              !expanded || activeIndex < 0
                ? event.key === 'ArrowDown'
                  ? 0
                  : matches.length - 1
                : (activeIndex + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) %
                  matches.length;
            setOpen(true);
            setActive(matches[next]!.value);
          } else if (event.key === 'Enter') {
            event.preventDefault();
            if (expanded && matches.length) select(matches[Math.max(0, activeIndex)]!.value);
            else {
              edited.current = false;
              onCommit(canonical(value) ?? value.trim());
              setOpen(false);
            }
          }
        }}
      />
      {expanded &&
        createPortal(
          <div ref={popup} className="cp-stage-candidates" style={position}>
            <div id={listId} ref={list} role="listbox" aria-label="关卡候选">
              {matches.map((stage, index) => (
                <div
                  id={`${listId}-${index}`}
                  key={stage.value}
                  role="option"
                  aria-selected={index === activeIndex}
                  className="cp-stage-candidate"
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseMove={() => setActive(stage.value)}
                  onClick={() => select(stage.value)}
                >
                  {stage.label}
                </div>
              ))}
            </div>
            {!matches.length && (
              <p className="cp-stage-candidates-hint" role="status">
                {current?.failed
                  ? '关卡目录暂不可用，可继续手动输入'
                  : !current?.result
                    ? '正在读取关卡…'
                    : '没有匹配关卡，可继续手动输入'}
              </p>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
