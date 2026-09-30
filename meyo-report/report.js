(function () {
  'use strict';

  const byId = (id) => document.getElementById(id);
  const setText = (id, text) => { const element = byId(id); if (element) element.textContent = text; };

  // 只展示已经保存的真实截图，不触发模型、游戏或联网操作。
  const raceViews = {
    compare: {
      caption: '9月21日，同一视角的真实返工前后。重点看左侧招牌与维修区，而不是把截图当整体质量评分。'
    },
    latest: {
      src: 'assets/racing-latest.png',
      alt: '9月22日后续版：夕阳海岸、起跑线和红色越野车',
      caption: '9月22日后续保存版：日落海岸、出发提示与操作引导。该轮后续仍超时，不是整体完成或世界级证明。'
    },
    menu: {
      src: 'assets/racing-menu.png',
      alt: 'TIDELINE最近保存版的实际游戏菜单',
      caption: '9月22日同一版本的真实菜单截图。玩法和源码随本地作品保留，截图不能替代实际操控与品质验证。'
    }
  };
  document.querySelectorAll('[data-race-view]').forEach((button) => {
    button.addEventListener('click', () => {
      const view = raceViews[button.dataset.raceView];
      if (!view) return;
      const comparing = button.dataset.raceView === 'compare';
      byId('race-comparison').hidden = !comparing;
      byId('comparison-control').hidden = !comparing;
      byId('race-single').hidden = comparing;
      document.querySelectorAll('[data-race-view]').forEach((item) => {
        item.setAttribute('aria-pressed', String(item === button));
      });
      if (!comparing) {
        const image = byId('race-single-image');
        image.src = view.src;
        image.alt = view.alt;
        const zoom = byId('race-single-zoom');
        zoom.dataset.zoom = view.src;
        zoom.dataset.caption = view.caption;
      }
      setText('race-caption', view.caption);
    });
  });

  const comparisonRange = byId('compare-range');
  const updateComparison = () => {
    const value = Number(comparisonRange.value);
    byId('race-comparison').style.setProperty('--reveal', value + '%');
    setText('compare-value', value + '%');
    comparisonRange.setAttribute('aria-valuetext', `显示${value}%改进前画面，${100 - value}%改进后画面`);
  };
  comparisonRange.addEventListener('input', updateComparison);
  updateComparison();

  // 原生dialog负责键盘关闭、焦点与模态语义；只操作本页面。
  const dialog = byId('image-dialog');
  let previousFocus = null;
  document.querySelectorAll('[data-zoom]').forEach((button) => {
    button.addEventListener('click', () => {
      const path = button.dataset.zoom;
      const caption = button.dataset.caption || '';
      const image = byId('dialog-image');
      image.src = path;
      image.alt = caption;
      setText('dialog-caption', caption);
      byId('dialog-download').href = path;
      previousFocus = button;
      dialog.showModal();
      byId('close-dialog').focus();
    });
  });
  byId('close-dialog').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    if (previousFocus && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
  });
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });

  // 图解作为原生iframe直接在HTML里显示，不再让用户点击一张说明占位后才载入。
  // 只标当前访问位置；不拿这个标签推断服务器健康或模型质量。
  const location = window.location;
  if (location && location.protocol === 'file:') {
    setText('publication-mode', '本地副本 · AI项目作品集');
    setText('publication-description', '这不是线上网址。可在本地看已有文件；转发给别人请使用右侧的正式网页链接。');
  } else if (location && location.hostname === 'seanliii.github.io') {
    setText('publication-mode', '项目作品集 · 看作品与实现');
    setText('publication-description', '点击节点了解Auto、实体关系、评测与作品阶段；完整原文按需展开。太阳系和3D对战固定地址不变，游戏版本与已知缺口也不变。');
  }

  const progress = byId('reading-progress');
  let scrollQueued = false;
  const updateProgress = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    progress.style.transform = `scaleX(${ratio})`;
    scrollQueued = false;
  };
  window.addEventListener('scroll', () => {
    if (!scrollQueued) { scrollQueued = true; window.requestAnimationFrame(updateProgress); }
  }, { passive: true });
  window.addEventListener('resize', updateProgress, { passive: true });
  updateProgress();

  // 图解默认简洁；完整文字仍在同页，按意愿打开而不是删除。
  const expandButton = byId('expand-report');
  const collapseButton = byId('collapse-report');
  const mainDetails = () => document.querySelectorAll('details');
  if (expandButton) expandButton.addEventListener('click', () => {
    mainDetails().forEach((detail) => { detail.open = true; });
    expandButton.setAttribute('aria-expanded', 'true');
    updateProgress();
  });
  if (collapseButton) collapseButton.addEventListener('click', () => {
    mainDetails().forEach((detail) => { detail.open = false; });
    if (expandButton) expandButton.setAttribute('aria-expanded', 'false');
    updateProgress();
  });
  const revealAnswer = (hash) => {
    if (!hash || !hash.startsWith('#')) return;
    let id;
    try { id = decodeURIComponent(hash.slice(1)); } catch { return; }
    const target = byId(id);
    if (!target) return;
    if (window.MeyoVisualShare) window.MeyoVisualShare.reveal(hash);
    for (let parent = target; parent; parent = parent.parentElement) {
      if (parent.tagName === 'DETAILS') parent.open = true;
    }
  };
  mainDetails().forEach(detail => detail.addEventListener('toggle', updateProgress));
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (event) => {
      if (event.defaultPrevented || event.button > 0
          || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      revealAnswer(link.getAttribute('href'));
    });
  });
  window.addEventListener('hashchange', () => revealAnswer(window.location && window.location.hash));
  revealAnswer(window.location && window.location.hash);
  if ('IntersectionObserver' in window) {
    const chapters = document.querySelectorAll('#thinking-evolution, #value, #mechanism-evidence, #works, #validation, #cloud-devices');
    const navigation = document.querySelectorAll('.main-nav a');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        navigation.forEach((link) => {
          if (link.getAttribute('href') === '#' + entry.target.id) link.setAttribute('aria-current', 'location');
          else link.removeAttribute('aria-current');
        });
      });
    }, { rootMargin: '-18% 0px -65% 0px', threshold: 0 });
    chapters.forEach((chapter) => observer.observe(chapter));
  }

  // 打印当前概览；原生展开项由用户决定，避免打印时悄悄改动页面状态。
  byId('print-report').addEventListener('click', () => window.print());
}());
