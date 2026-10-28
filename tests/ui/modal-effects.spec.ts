import { expect, test } from '@playwright/test';

type EffectsWindow = Window & {
  effects: { releaseA: () => void; releaseB: () => void; escaped: string[] };
};

test.beforeEach(async ({ page }) => {
  // Load only the Vite module host; these DOM fixtures never start the application.
  await page.route('**/src/main.tsx', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: '' }),
  );
  await page.goto('/');
  await page.setContent(`
    <div id="background"><button id="trigger">背景按钮</button></div>
    <div id="layer-a"><section id="panel-a"><button id="a-first">下层首项</button><button id="a-last">下层末项</button></section></div>
    <div id="layer-b"><section id="panel-b"><button id="b-first">上层首项</button><button id="b-last">上层末项</button></section></div>
  `);
});

test('overlapping backgrounds remain locked until the last out-of-order cleanup', async ({
  page,
}) => {
  const states = await page.evaluate(async () => {
    const modulePath = '/src/modal-effects.ts';
    const { acquireModalEffects } = await import(modulePath);
    const background = document.getElementById('background')!;
    const panelA = document.getElementById('panel-a')!;
    const panelB = document.getElementById('panel-b')!;
    const releaseA = acquireModalEffects({ panel: panelA, background: [background] });
    const releaseB = acquireModalEffects({ panel: panelB, background: [background] });
    releaseA();
    const intermediate = { inert: background.inert, overflow: document.body.style.overflow };
    releaseA();
    releaseB();
    releaseB();
    return {
      intermediate,
      final: { inert: background.inert, overflow: document.body.style.overflow },
    };
  });
  expect(states.intermediate).toEqual({ inert: true, overflow: 'hidden' });
  expect(states.final).toEqual({ inert: false, overflow: '' });
  await page.getByRole('button', { name: '背景按钮' }).click();
});

test('leases preserve preexisting inert, accessibility and scrolling values across remounts', async ({
  page,
}) => {
  const state = await page.evaluate(async () => {
    const modulePath = '/src/modal-effects.ts';
    const { acquireModalEffects } = await import(modulePath);
    const background = document.getElementById('background')!;
    const panel = document.getElementById('panel-a')!;
    background.inert = true;
    background.setAttribute('aria-hidden', 'false');
    background.style.overflowY = 'scroll';
    document.body.style.setProperty('overflow', 'auto', 'important');
    const acquire = () =>
      acquireModalEffects({
        panel,
        background: [background],
        ariaHidden: [background],
        scroll: [{ element: background, property: 'overflow-y' }],
      });
    const first = acquire();
    first();
    const second = acquire();
    first();
    second();
    return {
      inert: background.inert,
      aria: background.getAttribute('aria-hidden'),
      overflowY: background.style.overflowY,
      overflow: document.body.style.overflow,
      priority: document.body.style.getPropertyPriority('overflow'),
    };
  });
  expect(state).toEqual({
    inert: true,
    aria: 'false',
    overflowY: 'scroll',
    overflow: 'auto',
    priority: 'important',
  });
});

test('only the top overlay handles keyboard focus while the lower layer is inert', async ({
  page,
}) => {
  await page.getByRole('button', { name: '背景按钮' }).focus();
  await page.evaluate(async () => {
    const modulePath = '/src/modal-effects.ts';
    const { acquireModalEffects } = await import(modulePath);
    const escaped: string[] = [];
    const background = document.getElementById('background')!;
    const releaseA = acquireModalEffects({
      panel: document.getElementById('panel-a')!,
      layer: document.getElementById('layer-a')!,
      background: [background],
      onEscape: () => escaped.push('A'),
    });
    const releaseB = acquireModalEffects({
      panel: document.getElementById('panel-b')!,
      layer: document.getElementById('layer-b')!,
      background: [background],
      onEscape: () => escaped.push('B'),
    });
    (window as EffectsWindow).effects = { releaseA, releaseB, escaped };
  });
  await expect(page.locator('#layer-a')).toHaveJSProperty('inert', true);
  await expect(page.locator('#b-first')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#b-last')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#b-first')).toBeFocused();
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => (window as EffectsWindow).effects.escaped)).toEqual(['B']);
  await page.evaluate(() => (window as EffectsWindow).effects.releaseB());
  await expect(page.locator('#layer-a')).toHaveJSProperty('inert', false);
  await expect(page.locator('#a-first')).toBeFocused();
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => (window as EffectsWindow).effects.escaped)).toEqual(['B', 'A']);
  await page.evaluate(() => (window as EffectsWindow).effects.releaseA());
  await expect(page.locator('#trigger')).toBeFocused();
});

test('removing the lower overlay first restores the original trigger when the upper overlay closes', async ({
  page,
}) => {
  await page.locator('#trigger').focus();
  await page.evaluate(async () => {
    const modulePath = '/src/modal-effects.ts';
    const { acquireModalEffects } = await import(modulePath);
    const background = document.getElementById('background')!;
    const layerA = document.getElementById('layer-a')!;
    const releaseA = acquireModalEffects({
      panel: document.getElementById('panel-a')!,
      layer: layerA,
      background: [background],
    });
    const releaseB = acquireModalEffects({
      panel: document.getElementById('panel-b')!,
      background: [background],
    });
    releaseA();
    layerA.remove();
    (window as EffectsWindow).effects = { releaseA, releaseB, escaped: [] };
  });
  await expect(page.locator('#b-first')).toBeFocused();
  await page.evaluate(() => (window as EffectsWindow).effects.releaseB());
  await expect(page.locator('#trigger')).toBeFocused();
  await expect(page.locator('#background')).toHaveJSProperty('inert', false);
});

test('native modal dialogs keep browser keyboard behavior and return focus to the underlying overlay', async ({
  page,
}) => {
  await page.locator('#trigger').focus();
  await page.evaluate(async () => {
    const modulePath = '/src/modal-effects.ts';
    const { acquireModalEffects } = await import(modulePath);
    const escaped: string[] = [];
    const releaseA = acquireModalEffects({
      panel: document.getElementById('panel-a')!,
      layer: document.getElementById('layer-a')!,
      background: [document.getElementById('background')!],
      onEscape: () => escaped.push('A'),
    });
    const trigger = document.getElementById('a-first')!;
    const dialog = document.createElement('dialog');
    dialog.id = 'native-dialog';
    dialog.innerHTML = '<button>原生提示</button>';
    document.body.append(dialog);
    dialog.showModal();
    const release = acquireModalEffects({ panel: dialog, native: true, returnFocus: trigger });
    const releaseB = () => {
      dialog.close();
      release();
    };
    (window as EffectsWindow).effects = { releaseA, releaseB, escaped };
  });
  await expect(page.locator('#layer-a')).toHaveJSProperty('inert', true);
  await page.keyboard.press('Escape');
  await expect(page.locator('#native-dialog')).toHaveJSProperty('open', false);
  expect(await page.evaluate(() => (window as EffectsWindow).effects.escaped)).toEqual([]);
  await page.evaluate(() => (window as EffectsWindow).effects.releaseB());
  await expect(page.locator('#a-first')).toBeFocused();
  await page.evaluate(() => (window as EffectsWindow).effects.releaseA());
  await expect(page.locator('#trigger')).toBeFocused();
});

test('an unrelated native modal also takes precedence over drawer keyboard handlers', async ({
  page,
}) => {
  await page.evaluate(async () => {
    const modulePath = '/src/modal-effects.ts';
    const { acquireModalEffects } = await import(modulePath);
    const escaped: string[] = [];
    const releaseA = acquireModalEffects({
      panel: document.getElementById('panel-a')!,
      onEscape: () => escaped.push('A'),
    });
    const dialog = document.createElement('dialog');
    dialog.id = 'native-dialog';
    dialog.innerHTML = '<button>原生提示</button>';
    document.body.append(dialog);
    dialog.showModal();
    (window as EffectsWindow).effects = { releaseA, releaseB: () => {}, escaped };
  });
  await page.keyboard.press('Escape');
  await expect(page.locator('#native-dialog')).toHaveJSProperty('open', false);
  expect(await page.evaluate(() => (window as EffectsWindow).effects.escaped)).toEqual([]);
  await page.evaluate(() => (window as EffectsWindow).effects.releaseA());
});
