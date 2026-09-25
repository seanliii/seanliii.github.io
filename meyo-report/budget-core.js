(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MeyoBudget = factory();
  }
}(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  // 内部场景假设，不是行业平均、实际账或已实现增长。
  // D7/D30都以激活人数为分母；仅适用于观察窗口成熟后的期望人数。
  const ACTIVATION_RATE = 0.4;
  const D7_RATE = 0.2;
  const D30_RATE = 0.1;
  const MAX = Number.MAX_SAFE_INTEGER;

  function nonNegativeNumber(value, name) {
    // 仅IEEE-754数值安全上限；不是投放额度、天数或用户规模策略。
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > MAX) {
      throw new RangeError(name + ' must be a finite number between 0 and Number.MAX_SAFE_INTEGER');
    }
    return value === 0 ? 0 : value;
  }

  function positiveInteger(value, name) {
    nonNegativeNumber(value, name);
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new RangeError(name + ' must be a positive safe integer');
    }
    return value;
  }

  function calculateBudget(input) {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
      throw new RangeError('input must be an object containing numeric budget inputs');
    }
    const days = positiveInteger(input.days, 'days');
    const registrations = positiveInteger(input.registrations, 'registrations');
    const promotionWan = nonNegativeNumber(input.promotionWan, 'promotionWan');
    const aiDaily = nonNegativeNumber(input.aiDaily, 'aiDaily');
    const salaryDaily = nonNegativeNumber(
      input.salaryDaily === undefined ? 3000 : input.salaryDaily, 'salaryDaily');

    // 原始数值不做显示层四舍五入；所有派生金额也检查安全上限。
    const promotionYuan = nonNegativeNumber(promotionWan * 10000, 'promotionYuan');
    const aiCostYuan = nonNegativeNumber(days * aiDaily, 'aiCostYuan');
    const salaryCostYuan = nonNegativeNumber(days * salaryDaily, 'salaryCostYuan');
    const runCostYuan = nonNegativeNumber(aiCostYuan + salaryCostYuan, 'runCostYuan');
    const totalYuan = nonNegativeNumber(promotionYuan + runCostYuan, 'totalYuan');
    // AI日3000/5000的情景范围，不含额外用户费用，也不钳制给定aiDaily。
    const totalMinYuan = nonNegativeNumber(promotionYuan + days * 3000 + salaryCostYuan, 'totalMinYuan');
    const totalMaxYuan = nonNegativeNumber(promotionYuan + days * 5000 + salaryCostYuan, 'totalMaxYuan');
    const activationCount = registrations * ACTIVATION_RATE;
    const d7Count = activationCount * D7_RATE;
    const d30Count = activationCount * D30_RATE;

    return {
      days,
      promotionYuan,
      aiCostYuan,
      salaryCostYuan,
      runCostYuan,
      totalYuan,
      totalMinYuan,
      totalMaxYuan,
      activationCount,
      d7Count,
      d30Count,
      // 推广单价只除推广费；全成本单价包含本期间AI与工资。
      promotionPerRegistration: nonNegativeNumber(promotionYuan / registrations, 'promotionPerRegistration'),
      promotionPerActivation: nonNegativeNumber(promotionYuan / activationCount, 'promotionPerActivation'),
      totalPerActivation: nonNegativeNumber(totalYuan / activationCount, 'totalPerActivation'),
      shares: totalYuan === 0
        ? { promotion: 0, ai: 0, salary: 0 }
        : {
          promotion: promotionYuan / totalYuan,
          ai: aiCostYuan / totalYuan,
          salary: salaryCostYuan / totalYuan
        }
    };
  }

  return Object.freeze({ calculateBudget, ACTIVATION_RATE, D7_RATE, D30_RATE });
}));
