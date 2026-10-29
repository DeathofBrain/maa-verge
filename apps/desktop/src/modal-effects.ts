type ScrollLock = { element: HTMLElement; property?: 'overflow' | 'overflow-y' };
type ModalOptions = {
  panel: HTMLElement;
  layer?: HTMLElement;
  background?: (HTMLElement | null)[];
  ariaHidden?: (HTMLElement | null)[];
  scroll?: ScrollLock[];
  initialFocus?: HTMLElement | null;
  returnFocus?: HTMLElement | null;
  fallbackFocus?: () => HTMLElement | null | undefined;
  onEscape?: () => void;
  native?: boolean;
};

type Overlay = ModalOptions & { returnTarget: HTMLElement | null };
type PropertyLock = { count: number; restore: () => void };
const locks = new WeakMap<HTMLElement, Map<string, PropertyLock>>();
const overlays: Overlay[] = [];
const inactiveLayers = new Map<Overlay, () => void>();
const focusable =
  'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[tabindex]:not([tabindex="-1"])';

function lease(element: HTMLElement, property: string, apply: () => () => void) {
  let properties = locks.get(element);
  if (!properties) locks.set(element, (properties = new Map()));
  let lock = properties.get(property);
  if (!lock) {
    lock = { count: 0, restore: apply() };
    properties.set(property, lock);
  }
  lock.count++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--lock.count) return;
    lock.restore();
    properties.delete(property);
    if (!properties.size) locks.delete(element);
  };
}

function canFocus(element: HTMLElement | null | undefined): element is HTMLElement {
  return !!element?.isConnected && !element.closest('[inert]');
}

function targets(panel: HTMLElement) {
  return [...panel.querySelectorAll<HTMLElement>(focusable)].filter(
    (element) =>
      element.tabIndex >= 0 &&
      !element.closest('[hidden],[inert]') &&
      element.getClientRects().length > 0,
  );
}

function updateLayers() {
  for (const overlay of overlays) {
    if (overlay === overlays.at(-1)) {
      inactiveLayers.get(overlay)?.();
      inactiveLayers.delete(overlay);
    } else if (!inactiveLayers.has(overlay)) {
      const layer = overlay.layer ?? overlay.panel;
      inactiveLayers.set(
        overlay,
        lease(layer, 'inert', () => {
          const previous = layer.inert;
          layer.inert = true;
          return () => {
            layer.inert = previous;
          };
        }),
      );
    }
  }
}

function keydown(event: KeyboardEvent) {
  const overlay = overlays.at(-1);
  if (!overlay || overlay.native) return;
  // Browser-managed dialogs (including the window-close prompt) own their keyboard handling.
  if (document.querySelector('dialog:modal')) return;
  if (event.key === 'Escape') {
    if (document.querySelector('.app-context-menu, [data-select-menu]')) return;
    if (!overlay.onEscape) return;
    event.preventDefault();
    event.stopPropagation();
    overlay.onEscape();
    return;
  }
  if (event.key !== 'Tab') return;
  const nodes = targets(overlay.panel);
  const active = document.activeElement as HTMLElement;
  if (!nodes.length) {
    event.preventDefault();
  } else if (event.shiftKey && (!nodes.includes(active) || active === nodes[0])) {
    event.preventDefault();
    nodes.at(-1)?.focus();
  } else if (!event.shiftKey && (!nodes.includes(active) || active === nodes.at(-1))) {
    event.preventDefault();
    nodes[0].focus();
  }
}

// Each mounted overlay owns leases, never another overlay's intermediate state.
// The last release restores the original value even when cleanup runs out of order.
export function acquireModalEffects(options: ModalOptions): () => void {
  const { panel } = options;
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const overlay: Overlay = { ...options, returnTarget: options.returnFocus ?? active };
  const release: (() => void)[] = [];
  for (const element of new Set(options.background ?? [])) {
    if (!element) continue;
    release.push(
      lease(element, 'inert', () => {
        const previous = element.inert;
        element.inert = true;
        return () => {
          element.inert = previous;
        };
      }),
    );
  }
  for (const element of new Set(options.ariaHidden ?? [])) {
    if (!element) continue;
    release.push(
      lease(element, 'aria-hidden', () => {
        const previous = element.getAttribute('aria-hidden');
        element.setAttribute('aria-hidden', 'true');
        return () => {
          if (previous === null) element.removeAttribute('aria-hidden');
          else element.setAttribute('aria-hidden', previous);
        };
      }),
    );
  }
  for (const { element, property = 'overflow' } of [
    { element: document.body },
    ...(options.scroll ?? []),
  ]) {
    release.push(
      lease(element, `style:${property}`, () => {
        const previous = element.style.getPropertyValue(property);
        const priority = element.style.getPropertyPriority(property);
        element.style.setProperty(property, 'hidden');
        return () => {
          if (previous) element.style.setProperty(property, previous, priority);
          else element.style.removeProperty(property);
        };
      }),
    );
  }
  if (!overlays.length) document.addEventListener('keydown', keydown, true);
  overlays.push(overlay);
  updateLayers();
  if (!options.native) {
    (options.initialFocus ?? targets(panel)[0])?.focus({ preventScroll: true });
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const wasTop = overlays.at(-1) === overlay;
    overlays.splice(overlays.indexOf(overlay), 1);
    inactiveLayers.get(overlay)?.();
    inactiveLayers.delete(overlay);
    updateLayers();
    // A surviving child must return to the original trigger when its parent unmounts first.
    for (const remaining of overlays) {
      if (remaining.returnTarget && panel.contains(remaining.returnTarget))
        remaining.returnTarget = overlay.returnTarget;
    }
    for (const unlock of release.reverse()) unlock();
    if (!overlays.length) document.removeEventListener('keydown', keydown, true);
    if (!wasTop) return;
    const top = overlays.at(-1);
    const preferred = canFocus(overlay.returnTarget)
      ? overlay.returnTarget
      : options.fallbackFocus?.();
    if (top) {
      const target =
        canFocus(preferred) && top.panel.contains(preferred)
          ? preferred
          : (top.initialFocus ?? targets(top.panel)[0]);
      if (canFocus(target)) target.focus({ preventScroll: true });
    } else if (canFocus(preferred)) {
      preferred.focus({ preventScroll: true });
    }
  };
}
