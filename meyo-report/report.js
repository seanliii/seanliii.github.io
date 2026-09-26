(function () {
  'use strict';

  const byId = (id) => document.getElementById(id);
  const number = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 });
  const integer = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 });
  const wan = (yuan) => number.format(yuan / 10000);
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
    setText('publication-mode', '你正在看本地副本 · 2026.09.26交付物直达版');
    setText('publication-description', '这不是线上网址。可在本地看已有文件；转发给别人请使用右侧的正式网页链接。');
  } else if (location && location.hostname === 'seanliii.github.io') {
    setText('publication-mode', '个人主页正式展示页 · 2026.09.26交付物直达版');
    setText('publication-description', '作品区最前面就是在线体验、原成品和源码下载；新增Auto到军团的技术主线。公司测试站和学城仍需原有权限，不与独立作品地址混淆。');
  }

  const form = byId('budget-form');
  const updateBudget = () => {
    try {
      if (!window.MeyoBudget) throw new Error('预算计算文件未加载，请保留整个网页文件夹。');
      const input = {
        days: Number(form.elements.namedItem('days').value),
        promotionWan: Number(form.elements.namedItem('promotion').value),
        aiDaily: Number(form.elements.namedItem('aiDaily').value),
        salaryDaily: 3000,
        registrations: Number(form.elements.namedItem('registrations').value)
      };
      const result = window.MeyoBudget.calculateBudget(input);
      setText('promotion-value', number.format(input.promotionWan) + '万元');
      setText('ai-value', integer.format(input.aiDaily) + '元');
      setText('budget-total', wan(result.totalYuan));
      setText('budget-range', wan(result.totalMinYuan) + '—' + wan(result.totalMaxYuan) + '万元');
      setText('cost-promotion', wan(result.promotionYuan) + '万元');
      setText('cost-ai', wan(result.aiCostYuan) + '万元');
      setText('cost-salary', wan(result.salaryCostYuan) + '万元');
      for (const key of ['promotion', 'ai', 'salary']) {
        byId('bar-' + key).style.width = (result.shares[key] * 100).toFixed(4) + '%';
      }
      setText('count-activated', number.format(result.activationCount));
      setText('count-d7', number.format(result.d7Count));
      setText('count-d30', number.format(result.d30Count));
      setText('cost-per-activation', number.format(result.promotionPerActivation) + '元');
      setText('total-per-activation', number.format(result.totalPerActivation) + '元');
      byId('budget-error').hidden = true;
      // 只提供本地可复核结果，不持久化、不发送任何表单或用户数据。
      form.dataset.totalYuan = String(result.totalYuan);
      form.dataset.activationCount = String(result.activationCount);
    } catch (error) {
      setText('budget-error', '无法完成计算：' + error.message);
      byId('budget-error').hidden = false;
    }
  };
  form.addEventListener('input', updateBudget);
  form.addEventListener('change', updateBudget);
  form.addEventListener('submit', (event) => event.preventDefault());
  form.addEventListener('reset', () => window.setTimeout(updateBudget, 0));
  updateBudget();

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

  // 四段始终在同一页：从提纲跳到答案时先展开原生details，不把用户丢到隐藏锚点。
  const expandButton = byId('expand-report');
  const collapseButton = byId('collapse-report');
  const mainDetails = () => document.querySelectorAll('details.reading-detail');
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
    for (let parent = target.parentElement; parent; parent = parent.parentElement) {
      if (parent.tagName === 'DETAILS') parent.open = true;
    }
  };
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', () => revealAnswer(link.getAttribute('href')));
  });
  window.addEventListener('hashchange', () => revealAnswer(window.location && window.location.hash));
  revealAnswer(window.location && window.location.hash);
  if ('IntersectionObserver' in window) {
    const chapters = document.querySelectorAll('#thinking-evolution, #value, #works, #validation, #investment');
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
