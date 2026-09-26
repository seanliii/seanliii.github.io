/* One fixed entry, immutable original releases. No polling or model calls. */
(() => {
  'use strict';
  const frame = document.getElementById('project-frame');
  const selector = document.getElementById('project-version');
  const toggle = document.getElementById('project-toggle');
  const direct = document.getElementById('project-direct');
  let active = true;
  const allowed = new Set(Array.from(selector.options, option => option.value));
  function selectedPath() {
    const value = selector.value;
    if (!allowed.has(value) || !value.startsWith('versions/') || value.includes('..')) return null;
    return value;
  }
  selector.addEventListener('change', () => {
    const value = selectedPath();
    if (!value) return;
    frame.src = value;
    direct.href = value;
    active = true;
    toggle.textContent = '停止运行';
    toggle.setAttribute('aria-pressed', 'false');
  });
  toggle.addEventListener('click', () => {
    const value = selectedPath();
    if (!value) return;
    active = !active;
    frame.src = active ? value : 'about:blank';
    toggle.textContent = active ? '停止运行' : '重新打开';
    toggle.setAttribute('aria-pressed', String(!active));
  });
})();
