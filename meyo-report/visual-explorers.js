(function (window, document) {
  'use strict';

  // 独立的原生按钮分组；只改可见状态，不模拟tab、不抢焦点。
  // 以defer加载：HTML已解析，后续report.js可直接调用reveal。
  const states = new WeakMap();
  const rootSelector = '[data-explorer]';

  function stateFor(root) {
    if (!root) return null;
    if (states.has(root)) return states.get(root);
    const owned = (selector) => Array.from(root.querySelectorAll(selector))
      .filter((node) => node.closest(rootSelector) === root);
    const buttons = owned('button[data-explorer-select]');
    const panels = owned('[data-explorer-panel]');
    const pairs = [];
    for (const button of buttons) {
      const key = button.getAttribute('data-explorer-select');
      const controls = button.getAttribute('aria-controls');
      if (!key || !controls) continue;
      // 不把key/ID拼进CSS选择器；aria-controls不能越过所属容器。
      const panel = panels.find((node) => node.id === controls
        && node.getAttribute('data-explorer-panel') === key);
      if (panel) pairs.push({ button, panel });
    }
    const state = { buttons, panels, pairs };
    states.set(root, state);
    return state;
  }

  function select(state, pair) {
    if (!state || !pair || !state.pairs.includes(pair)) return false;
    for (const button of state.buttons) {
      button.setAttribute('aria-pressed', String(button === pair.button));
    }
    for (const panel of state.panels) panel.hidden = panel !== pair.panel;
    return true;
  }

  function reveal(hash) {
    if (typeof hash !== 'string' || hash[0] !== '#' || hash.length < 2) return false;
    let id;
    try {
      id = decodeURIComponent(hash.slice(1));
    } catch (_) {
      return false;
    }
    const target = document.getElementById(id);
    if (!target) return false;

    // 先验证整条祖先链，再由外向内展开，避免坏配对造成只展开一半。
    const actions = [];
    for (let node = target; node; node = node.parentElement) {
      if (node.matches('[data-explorer-panel]') && node.hidden) {
        const state = stateFor(node.closest(rootSelector));
        const pair = state && state.pairs.find((item) => item.panel === node);
        if (!pair) return false;
        actions.push(() => select(state, pair));
      }
      if (node.tagName === 'DETAILS') actions.push(() => { node.open = true; });
    }
    actions.reverse().forEach((act) => act());
    return true;
  }

  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button > 0
      || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const target = event.target && (event.target.closest
      ? event.target : event.target.parentElement);
    if (!target) return;
    const button = target.closest('button');
    if (button && !button.disabled) {
      const state = stateFor(button.closest(rootSelector));
      if (state) {
        if (button.getAttribute('data-explorer-select') !== null) {
          select(state, state.pairs.find((pair) => pair.button === button));
          return;
        }
        const next = button.getAttribute('data-explorer-next') !== null;
        const prev = button.getAttribute('data-explorer-prev') !== null;
        if (next || prev) {
          const choices = state.pairs.filter((pair) => !pair.button.disabled);
          if (!choices.length) return;
          const current = choices.findIndex((pair) =>
            pair.button.getAttribute('aria-pressed') === 'true');
          const index = current < 0 ? (next ? 0 : choices.length - 1)
            : (current + (next ? 1 : -1) + choices.length) % choices.length;
          select(state, choices[index]);
          return;
        }
      }
    }
    const anchor = target.closest('a[href^="#"]');
    if (anchor) reveal(anchor.getAttribute('href'));
    // 不preventDefault：保留原生片段导航、历史和按钮Enter/Space行为。
  });

  window.MeyoVisualShare = window.MeyoVisualShare || {};
  window.MeyoVisualShare.reveal = reveal;
  window.addEventListener('hashchange', () => reveal(window.location.hash));

  for (const root of document.querySelectorAll(rootSelector)) {
    const state = stateFor(root);
    const initial = state.pairs.find((pair) =>
      pair.button.getAttribute('aria-pressed') === 'true')
      || state.pairs.find((pair) => !pair.panel.hidden)
      || state.pairs[0];
    select(state, initial);
  }
  reveal(window.location.hash);
})(window, document);
