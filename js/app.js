const AppState = {
  params: {
    method: 'movingAverage',
    windowSize: 5,
    alpha: 0.3,
    globalCaseSize: 12,
    globalSafetyDays: 3
  },
  promotions: [],
  forecastResults: {},
  promoImpacts: {},
  accuracyResults: {},
  turnoverResults: {},
  replenishmentResults: {},
  compareResults: null,
  selectedSkus: new Set(),
  expandedRows: new Set(),
  searchQuery: '',
  categoryFilter: '',
  futureDates: [],
  _initialized: false
};

const CATEGORY_EMOJI = {
  '饮料': '🥤',
  '零食': '🍿',
  '方便食品': '🍜',
  '乳制品': '🥛',
  '调味品': '🧂',
  '个护': '🧴',
  '日用': '🧻'
};

function $(sel, root = document) { return root.querySelector(sel); }
function $all(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

function initApp() {
  if (AppState._initialized) return;
  AppState._initialized = true;
  AppState.futureDates = getFutureDates();
  AppState.turnoverResults = calculateTurnoverForAll();
  updateCurrentDate();
  initCategoryFilter();
  initPromoSkuSelect();
  setDefaultPromoDate();
  bindEvents();
  renderPromoList();
  renderKpiBaseline();
  renderTable();
}

function updateCurrentDate() {
  const now = new Date();
  const opts = { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' };
  $('#currentDate').textContent = '📅 ' + now.toLocaleDateString('zh-CN', opts);
}

function initCategoryFilter() {
  const sel = $('#categoryFilter');
  const catSel = $('#promoCategorySelect');
  CATEGORIES.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat; opt.textContent = cat;
    sel.appendChild(opt);
    const opt2 = opt.cloneNode(true);
    catSel.appendChild(opt2);
  });
}

function initPromoSkuSelect() {
  const sel = $('#promoSkuSelect');
  SKU_DATA.forEach(sku => {
    const opt = document.createElement('option');
    opt.value = sku.id;
    opt.textContent = `${sku.id} - ${sku.name}`;
    sel.appendChild(opt);
  });
  updatePromoPreview();
}

function setDefaultPromoDate() {
  const dates = getFutureDates();
  $('#promoStartDate').value = dates[2] || dates[0];
  $('#promoEndDate').value = dates[3] || dates[0];
  $('#promoStartDate').min = dates[0];
  $('#promoStartDate').max = dates[dates.length - 1];
  $('#promoEndDate').min = dates[0];
  $('#promoEndDate').max = dates[dates.length - 1];
}

function bindEvents() {
  $('#runForecastBtn').addEventListener('click', runFullForecast);
  $('#runCompareBtn').addEventListener('click', openCompareModal);
  $('#compareBtn').addEventListener('click', openCompareModal);
  $('#runCompareAgainBtn').addEventListener('click', () => runCompare(true));
  $('#applyMABtn').addEventListener('click', () => applyComparePlan('movingAverage'));
  $('#applyESBtn').addEventListener('click', () => applyComparePlan('exponentialSmoothing'));
  $('#cancelCompareBtn').addEventListener('click', closeCompareModal);
  $('#closeCompareModal').addEventListener('click', closeCompareModal);

  $('#forecastMethod').addEventListener('change', (e) => {
    AppState.params.method = e.target.value;
    toggleAlphaGroup();
  });
  $all('input[name="windowSize"]').forEach(r => {
    r.addEventListener('change', (e) => {
      AppState.params.windowSize = parseInt(e.target.value);
    });
  });
  $('#alphaSlider').addEventListener('input', (e) => {
    AppState.params.alpha = parseFloat(e.target.value);
    $('#alphaValue').textContent = AppState.params.alpha.toFixed(2);
  });
  $('#safetySlider').addEventListener('input', (e) => {
    AppState.params.globalSafetyDays = parseInt(e.target.value);
    $('#safetyValue').textContent = AppState.params.globalSafetyDays + ' 天';
    if (Object.keys(AppState.replenishmentResults).length > 0) {
      quickRefreshReplenishment();
    }
  });
  $('#caseSizeInput').addEventListener('change', (e) => {
    AppState.params.globalCaseSize = parseInt(e.target.value) || 12;
    if (Object.keys(AppState.replenishmentResults).length > 0) {
      quickRefreshReplenishment();
    }
  });

  $('#searchInput').addEventListener('input', (e) => {
    AppState.searchQuery = e.target.value.toLowerCase();
    renderTable();
  });
  $('#categoryFilter').addEventListener('change', (e) => {
    AppState.categoryFilter = e.target.value;
    renderTable();
  });
  $('#selectAll').addEventListener('change', (e) => {
    if (e.target.checked) {
      getFilteredSkus().forEach(s => AppState.selectedSkus.add(s.id));
    } else {
      AppState.selectedSkus.clear();
    }
    renderTable();
  });

  $('#addPromoBtn').addEventListener('click', openPromoModal);
  $('#addPromoBtn2').addEventListener('click', openPromoModal);
  $('#closePromoModal').addEventListener('click', closePromoModal);
  $('#cancelPromoBtn').addEventListener('click', closePromoModal);
  $('#confirmPromoBtn').addEventListener('click', addPromotion);
  $('#promoModal').addEventListener('click', (e) => {
    if (e.target.id === 'promoModal') closePromoModal();
  });
  $all('input[name="promoScope"]').forEach(r => {
    r.addEventListener('change', handlePromoScopeChange);
  });
  $('#promoDiscount').addEventListener('change', () => {
    const discount = parseFloat($('#promoDiscount').value);
    const skuId = $('#promoSkuSelect').value;
    const sku = getSkuById(skuId);
    const suggested = 1 + (1 - discount) * sku.promotionElasticity;
    $('#promoImpact').value = Math.min(3, Math.max(1, suggested));
    $('#promoImpactValue').textContent = parseFloat($('#promoImpact').value).toFixed(1) + 'x';
    updatePromoPreview();
  });
  $('#promoImpact').addEventListener('input', (e) => {
    $('#promoImpactValue').textContent = parseFloat(e.target.value).toFixed(1) + 'x';
  });
  $('#promoStartDate').addEventListener('change', () => {
    if ($('#promoEndDate').value < $('#promoStartDate').value) {
      $('#promoEndDate').value = $('#promoStartDate').value;
    }
    updatePromoPreview();
  });
  $('#promoEndDate').addEventListener('change', updatePromoPreview);
  $('#promoCategorySelect').addEventListener('change', updatePromoPreview);
  $('#promoSkuSelect').addEventListener('change', updatePromoPreview);

  $('#exportBtn').addEventListener('click', openConfirmModal);
  $('#closeConfirmModal').addEventListener('click', closeConfirmModal);
  $('#cancelConfirmBtn').addEventListener('click', closeConfirmModal);
  $('#finalExportBtn').addEventListener('click', doFinalExport);
  $('#confirmModal').addEventListener('click', (e) => {
    if (e.target.id === 'confirmModal') closeConfirmModal();
  });

  toggleAlphaGroup();
}

function toggleAlphaGroup() {
  $('#alphaGroup').style.display = AppState.params.method === 'exponentialSmoothing' ? 'block' : 'none';
}

function quickRefreshReplenishment() {
  if (!AppState.forecastResults || Object.keys(AppState.forecastResults).length === 0) return;
  AppState.replenishmentResults = calculateAllReplenishment(
    AppState.forecastResults,
    AppState.params
  );
  renderTable();
  updateKpiBuyAmount();
}

function runFullForecast() {
  const btn = $('#runForecastBtn');
  btn.disabled = true;
  btn.textContent = '⏳ 正在计算...';
  setTimeout(() => {
    const result = runForecastForAll(AppState.params, AppState.promotions, AppState.futureDates);
    AppState.forecastResults = result.forecast;
    AppState.promoImpacts = result.promoImpacts || {};
    AppState.accuracyResults = calculateAccuracyForAll(AppState.forecastResults);
    AppState.replenishmentResults = calculateAllReplenishment(
      AppState.forecastResults,
      AppState.params
    );
    Object.keys(AppState.replenishmentResults).forEach(skuId => {
      if (AppState.replenishmentResults[skuId].needsReplenish) {
        AppState.selectedSkus.add(skuId);
      }
    });
    renderTable(true);
    renderKpiAfterForecast();
    btn.disabled = false;
    btn.textContent = '🚀 运行预测';
  }, 300);
}

/* ========== 方案对比 ========== */
function openCompareModal() {
  $('#compareModal').classList.add('active');
  if (!AppState.compareResults) {
    runCompare(false);
  } else {
    renderCompareTable();
  }
}

function closeCompareModal() {
  $('#compareModal').classList.remove('active');
}

function runCompare(animate) {
  const btn = $('#runCompareAgainBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 计算中...'; }
  setTimeout(() => {
    AppState.compareResults = compareTwoPlans(
      AppState.params,
      AppState.promotions,
      AppState.futureDates
    );
    renderCompareTable();
    if (btn) { btn.disabled = false; btn.textContent = '🔄 重新计算对比'; }
  }, animate ? 400 : 0);
}

function renderCompareTable() {
  const r = AppState.compareResults;
  if (!r) return;
  const ma = r.movingAverage, es = r.exponentialSmoothing;
  const maAccAvg = Object.values(ma.accuracy).reduce((a,b)=>a+b,0) / Object.values(ma.accuracy).length;
  const esAccAvg = Object.values(es.accuracy).reduce((a,b)=>a+b,0) / Object.values(es.accuracy).length;
  let maAmount = 0, esAmount = 0;
  Object.keys(ma.replenishment).forEach(id => {
    const sku = getSkuById(id);
    maAmount += (ma.replenishment[id]?.adjustedQty || 0) * sku.unitPrice;
    esAmount += (es.replenishment[id]?.adjustedQty || 0) * sku.unitPrice;
  });
  $('#compareMAAccuracy').textContent = maAccAvg.toFixed(1) + '%';
  $('#compareESAccuracy').textContent = esAccAvg.toFixed(1) + '%';
  $('#compareMAAmount').textContent = '¥' + formatLargeNumber(maAmount);
  $('#compareESAmount').textContent = '¥' + formatLargeNumber(esAmount);
  const tbody = $('#compareTableBody');
  const rows = [];
  const filtered = getFilteredSkus();
  filtered.forEach(sku => {
    const maR = ma.replenishment[sku.id];
    const esR = es.replenishment[sku.id];
    const maF = maR?.totalForecast || 0;
    const esF = esR?.totalForecast || 0;
    const maA = ma.accuracy[sku.id] || 0;
    const esA = es.accuracy[sku.id] || 0;
    const maQ = maR?.suggestedQty || 0;
    const esQ = esR?.suggestedQty || 0;
    const maAmt = Math.round(maQ * sku.unitPrice * 100) / 100;
    const esAmt = Math.round(esQ * sku.unitPrice * 100) / 100;
    const accMABetter = maA > esA ? 'compare-diff-better' : (maA < esA ? 'compare-diff-worse' : 'compare-diff-equal');
    const accESBetter = esA > maA ? 'compare-diff-better' : (esA < maA ? 'compare-diff-worse' : 'compare-diff-equal');
    const qtyDiff = Math.abs(maQ - esQ);
    const amtDiff = Math.abs(maAmt - esAmt);
    const emoji = CATEGORY_EMOJI[sku.category] || '📦';
    rows.push(`
      <tr>
        <td>
          <div class="sku-info">
            <div class="sku-avatar">${emoji}</div>
            <div class="sku-text">
              <div class="sku-name">${sku.name}</div>
              <div class="sku-id">${sku.id}</div>
            </div>
          </div>
        </td>
        <td class="num-col num-mono">${formatNumber(maF)}</td>
        <td class="num-col num-mono">${formatNumber(esF)}${qtyDiff > 0 ? `<div style="font-size:9px;color:var(--gray-500);">差${qtyDiff}</div>` : ''}</td>
        <td class="num-col num-mono ${accMABetter}">${maA.toFixed(1)}%</td>
        <td class="num-col num-mono ${accESBetter}">${esA.toFixed(1)}%</td>
        <td class="num-col num-mono">${formatNumber(maQ)}</td>
        <td class="num-col num-mono">${formatNumber(esQ)}</td>
        <td class="num-col num-mono">¥${formatNumber(maAmt)}</td>
        <td class="num-col num-mono">${amtDiff > 0 ? `<span class="num-orange">¥${formatNumber(esAmt)}</span><div style="font-size:9px;color:var(--gray-500);">差¥${formatNumber(amtDiff)}</div>` : `¥${formatNumber(esAmt)}`}</td>
      </tr>
    `);
  });
  tbody.innerHTML = rows.join('');
}

function applyComparePlan(method) {
  if (!AppState.compareResults) return;
  const plan = AppState.compareResults[method];
  AppState.forecastResults = plan.forecast;
  AppState.promoImpacts = plan.promoImpacts || {};
  AppState.accuracyResults = plan.accuracy;
  AppState.replenishmentResults = plan.replenishment;
  AppState.params.method = method;
  $('#forecastMethod').value = method;
  toggleAlphaGroup();
  Object.keys(AppState.replenishmentResults).forEach(id => {
    if (AppState.replenishmentResults[id].needsReplenish) {
      AppState.selectedSkus.add(id);
    }
  });
  renderTable(true);
  renderKpiAfterForecast();
  closeCompareModal();
}

/* ========== 促销管理（增强版） ========== */
function openPromoModal() {
  $('#promoModal').classList.add('active');
  updatePromoPreview();
}

function closePromoModal() {
  $('#promoModal').classList.remove('active');
}

function handlePromoScopeChange() {
  const scope = $all('input[name="promoScope"]').find(r => r.checked)?.value || 'single';
  $('#promoSkuRow').style.display = scope === 'single' ? 'block' : 'none';
  $('#promoCategoryRow').style.display = scope === 'category' ? 'block' : 'none';
  updatePromoPreview();
}

function updatePromoPreview() {
  const scope = $all('input[name="promoScope"]').find(r => r.checked)?.value || 'single';
  const discount = parseFloat($('#promoDiscount').value);
  const impact = parseFloat($('#promoImpact').value);
  const startDate = $('#promoStartDate').value;
  const endDate = $('#promoEndDate').value;
  let scopeText = '', skuCount = 0;
  if (scope === 'single') {
    const sku = getSkuById($('#promoSkuSelect').value);
    scopeText = `商品「${sku.name}」`;
    skuCount = 1;
  } else if (scope === 'category') {
    const cat = $('#promoCategorySelect').value || '全部分类';
    const list = cat ? SKU_DATA.filter(s => s.category === cat) : SKU_DATA;
    scopeText = `分类「${cat}」共 ${list.length} 个商品`;
    skuCount = list.length;
  } else {
    scopeText = `全店共 ${SKU_DATA.length} 个商品`;
    skuCount = SKU_DATA.length;
  }
  let dayCount = 1;
  if (startDate && endDate) {
    dayCount = Math.max(1, Math.round((new Date(endDate) - new Date(startDate)) / 86400000) + 1);
  }
  const rangeText = startDate && endDate ? `${startDate.slice(5)} ~ ${endDate.slice(5)} (${dayCount}天)` : '未选择日期';
  const discountText = Math.round(discount * 10) + '折';
  const box = $('#promoPreviewText');
  box.innerHTML = `
    💡 <strong>活动预览：</strong>对 <strong>${scopeText}</strong> 生效<br>
    📅 活动时间：<strong>${rangeText}</strong>，<strong>${discountText}</strong>，销量乘数 <strong class="num-orange">${impact.toFixed(1)}x</strong><br>
    📊 预计影响 <strong>${skuCount} 个SKU × ${dayCount} 天</strong> 共 ${skuCount * dayCount} 个销量预测值
  `;
}

function addPromotion() {
  const scope = $all('input[name="promoScope"]').find(r => r.checked)?.value || 'single';
  const startDate = $('#promoStartDate').value;
  const endDate = $('#promoEndDate').value;
  if (!startDate || !endDate) { alert('请选择促销日期范围！'); return; }
  const discount = parseFloat($('#promoDiscount').value);
  const impactFactor = parseFloat($('#promoImpact').value);
  const promoName = $('#promoName').value.trim() || `${Math.round(discount * 10)}折活动`;
  const promo = {
    id: 'PROMO' + Date.now(),
    name: promoName,
    scope,
    discount,
    impactFactor,
    startDate,
    endDate
  };
  if (scope === 'single') {
    promo.skuId = $('#promoSkuSelect').value;
  } else if (scope === 'category') {
    promo.category = $('#promoCategorySelect').value;
    if (!promo.category) { alert('请选择促销分类！'); return; }
  }
  AppState.promotions.push(promo);
  AppState.promotions.sort((a, b) => a.startDate.localeCompare(b.startDate));
  renderPromoList();
  if (Object.keys(AppState.forecastResults).length > 0) {
    runFullForecast();
  }
  closePromoModal();
}

function removePromotion(id) {
  AppState.promotions = AppState.promotions.filter(p => p.id !== id);
  renderPromoList();
  if (Object.keys(AppState.forecastResults).length > 0) {
    runFullForecast();
  }
}

function renderPromoList() {
  const list = $('#promoList');
  if (AppState.promotions.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🎉</div>
        <div>暂无促销计划</div>
        <div style="margin-top: 4px;">点击「新增」添加促销活动</div>
      </div>`;
    return;
  }
  list.innerHTML = AppState.promotions.map(p => {
    const dayCount = Math.max(1, Math.round((new Date(p.endDate) - new Date(p.startDate)) / 86400000) + 1);
    let scopeLabel = '';
    if (p.scope === 'single') {
      const sku = getSkuById(p.skuId);
      scopeLabel = `${CATEGORY_EMOJI[sku.category] || '📦'} ${sku.name}`;
    } else if (p.scope === 'category') {
      scopeLabel = `🏷️ ${p.category}分类`;
    } else {
      scopeLabel = '🏬 全店商品';
    }
    const dateLabel = `${p.startDate.slice(5).replace('-','/')}~${p.endDate.slice(5).replace('-','/')}(${dayCount}天)`;
    const discLabel = Math.round(p.discount * 10) + '折';
    return `
      <div class="promo-item">
        <div class="promo-header">
          <span class="promo-sku" style="font-size: 12px;">${p.name || '促销活动'}</span>
          <button class="promo-close" onclick="removePromotion('${p.id}')">×</button>
        </div>
        <div class="promo-details">
          <span class="promo-detail" style="flex:1;min-width:100%;">${scopeLabel}</span>
          <span class="promo-detail">📅 <strong>${dateLabel}</strong></span>
          <span class="promo-detail">🏷️ <strong>${discLabel}</strong></span>
          <span class="promo-detail">📈 <strong>${p.impactFactor.toFixed(1)}x</strong></span>
        </div>
      </div>
    `;
  }).join('');
}

/* ========== 采购确认页 ========== */
function openConfirmModal() {
  if (AppState.selectedSkus.size === 0) {
    alert('请先在表格中勾选需要采购的商品！');
    return;
  }
  if (Object.keys(AppState.replenishmentResults).length === 0) {
    alert('请先点击「运行预测」生成补货建议！');
    return;
  }
  renderConfirmPage();
  $('#confirmModal').classList.add('active');
}

function closeConfirmModal() {
  $('#confirmModal').classList.remove('active');
}

function renderConfirmPage() {
  const tbody = $('#confirmTableBody');
  const rows = [];
  let totalQty = 0, totalCases = 0, totalAmount = 0, totalCoverage = 0, count = 0;
  AppState.selectedSkus.forEach(skuId => {
    const sku = getSkuById(skuId);
    const rep = AppState.replenishmentResults[skuId];
    if (!rep || rep.adjustedQty <= 0) return;
    const qty = rep.adjustedQty;
    const cases = rep.cases;
    const amount = Math.round(qty * sku.unitPrice * 100) / 100;
    const stockAfter = sku.currentStock + qty;
    const coverage = rep.coverageDaysAfterOrder;
    totalQty += qty; totalCases += cases; totalAmount += amount;
    totalCoverage += coverage; count++;
    let covClass = 'coverage-good';
    if (coverage < 7) covClass = 'coverage-low';
    else if (coverage < 14) covClass = 'coverage-warning';
    const emoji = CATEGORY_EMOJI[sku.category] || '📦';
    rows.push(`
      <tr>
        <td>
          <div class="sku-info">
            <div class="sku-avatar">${emoji}</div>
            <div class="sku-text">
              <div class="sku-name">${sku.name}</div>
              <div class="sku-id">${sku.id}</div>
            </div>
          </div>
        </td>
        <td><span class="category-tag">${sku.category}</span></td>
        <td class="num-col num-mono">¥${sku.unitPrice.toFixed(2)}</td>
        <td class="num-col num-mono">${formatNumber(sku.currentStock)}</td>
        <td class="num-col num-mono">${formatNumber(rep.totalForecast)}</td>
        <td class="num-col num-mono">${formatNumber(rep.safetyStock)}</td>
        <td class="num-col num-mono">${rep.caseSize}</td>
        <td class="num-col num-mono">${cases}</td>
        <td class="num-col num-mono num-orange">${formatNumber(qty)}</td>
        <td class="num-col num-mono num-orange">¥${formatNumber(amount)}</td>
        <td class="num-col num-mono">${formatNumber(stockAfter)}</td>
        <td class="num-col num-mono ${covClass}">${coverage.toFixed(1)}天</td>
      </tr>
    `);
  });
  const avgCoverage = count > 0 ? (totalCoverage / count) : 0;
  const methodName = AppState.params.method === 'movingAverage'
    ? `移动平均法(${AppState.params.windowSize}天)`
    : `指数平滑法(α=${AppState.params.alpha})`;
  $('#confirmSkuCount').textContent = count;
  $('#confirmTotalCases').textContent = totalCases;
  $('#confirmTotalQty').textContent = formatNumber(totalQty);
  $('#confirmTotalAmount').textContent = '¥' + formatNumber(Math.round(totalAmount * 100) / 100);
  $('#confirmAvgCoverage').textContent = avgCoverage.toFixed(1);
  $('#confirmMethodName').textContent = methodName;
  $('#confirmPromoCount').textContent = AppState.promotions.length;
  rows.push(`
    <tr class="confirm-summary-row">
      <td colspan="7" style="text-align:left;"><strong>✅ 合计</strong></td>
      <td class="num-col"><strong>${totalCases}</strong></td>
      <td class="num-col"><strong>${formatNumber(totalQty)}</strong></td>
      <td class="num-col"><strong>¥${formatNumber(Math.round(totalAmount * 100) / 100)}</strong></td>
      <td class="num-col">—</td>
      <td class="num-col"><strong>平均 ${avgCoverage.toFixed(1)}天</strong></td>
    </tr>
  `);
  tbody.innerHTML = rows.join('');
}

function doFinalExport() {
  if (AppState.selectedSkus.size === 0) { alert('没有选中的商品！'); return; }
  exportPurchaseOrder(
    Array.from(AppState.selectedSkus),
    AppState.replenishmentResults,
    AppState.futureDates
  );
  closeConfirmModal();
}

/* ========== 表格渲染 ========== */
function getFilteredSkus() {
  return SKU_DATA.filter(sku => {
    if (AppState.categoryFilter && sku.category !== AppState.categoryFilter) return false;
    if (AppState.searchQuery) {
      const q = AppState.searchQuery;
      if (!sku.name.toLowerCase().includes(q) && !sku.id.toLowerCase().includes(q)) return false;
    }
    return true;
  });
}

function renderTable(animate = false) {
  const tbody = $('#skuTableBody');
  const filteredSkus = getFilteredSkus();
  $('#skuCountBadge').textContent = `${filteredSkus.length}个SKU`;
  let alertCount = 0;
  let totalPromoDelta = 0;
  const rows = [];
  filteredSkus.forEach((sku, idx) => {
    const sales = getSalesBySku(sku.id);
    const turnover = AppState.turnoverResults[sku.id];
    const forecast = AppState.forecastResults[sku.id];
    const accuracy = AppState.accuracyResults[sku.id];
    const replen = AppState.replenishmentResults[sku.id];
    const promoImpact = AppState.promoImpacts[sku.id];
    const hasForecast = !!forecast;
    if (hasForecast && replen && replen.currentStock < replen.safetyStock) alertCount++;
    let skuPromoDelta = 0;
    if (promoImpact) {
      promoImpact.forEach(pi => { if (pi) skuPromoDelta += pi.delta; });
    }
    totalPromoDelta += skuPromoDelta;
    const avgDaily = Math.round(turnover.monthlySales / 30);
    const turnoverBadge = getTurnoverBadge(turnover.rate);
    const accuracyBadge = hasForecast ? getAccuracyBadge(accuracy) : '<span class="badge badge-warning">待预测</span>';
    const stockBadge = replen ? getStockBadge(replen.currentStock, replen.safetyStock) : '';
    const sparkId = `spark_${sku.id}`;
    const skuPromoDates = new Set();
    AppState.promotions.forEach(p => {
      const affectedSkus = getPromoAffectedSkus(p);
      if (affectedSkus.includes(sku.id)) {
        expandPromoDateRange(p).forEach(d => skuPromoDates.add(d));
      }
    });
    const isExpanded = AppState.expandedRows.has(sku.id);
    const slowClass = turnover.slowMoving ? 'slow-moving' : '';
    const animClass = animate ? 'updated' : '';
    const animDelay = animate ? `style="animation-delay: ${idx * 0.05}s"` : '';
    const checkboxChecked = AppState.selectedSkus.has(sku.id) ? 'checked' : '';
    const categoryEmoji = CATEGORY_EMOJI[sku.category] || '📦';
    const safetyTag = replen
      ? (replen.safetyStockSource === 'sku'
          ? '<span class="rule-sku-tag">独立</span>'
          : '<span class="rule-global-tag">全局</span>')
      : '';
    const caseSizeHtml = replen
      ? `<div class="case-size-cell">
          <span class="num-mono">${replen.caseSize}</span>
          ${replen.caseSizeSource === 'sku'
            ? '<span class="rule-sku-tag">独立</span>'
            : '<span class="rule-global-tag">全局</span>'}
         </div>`
      : '—';
    const promoDeltaBadge = (hasForecast && skuPromoDelta > 0)
      ? `<span class="promo-delta-badge" title="促销抬高销量+${skuPromoDelta}">+${skuPromoDelta}</span>`
      : '';
    rows.push(`
      <tr class="${slowClass} ${animClass}" ${animDelay} data-sku="${sku.id}">
        <td><input type="checkbox" class="row-check" data-sku="${sku.id}" ${checkboxChecked}></td>
        <td>
          <div class="sku-info">
            <div class="sku-avatar">${categoryEmoji}</div>
            <div class="sku-text">
              <div class="sku-name">${sku.name}</div>
              <div class="sku-id">${sku.id}</div>
            </div>
          </div>
        </td>
        <td><span class="category-tag">${sku.category}</span></td>
        <td class="num-col num-mono">¥${sku.unitPrice.toFixed(2)}</td>
        <td class="num-col">
          <span class="num-mono ${replen && replen.currentStock < replen.safetyStock ? 'num-negative' : ''}">
            ${formatNumber(sku.currentStock)}
          </span>
          ${stockBadge}
        </td>
        <td><canvas id="${sparkId}" class="sparkline-canvas" width="100" height="28"></canvas></td>
        <td class="num-col num-mono">${formatNumber(turnover.monthlySales)}<br><span style="font-size:10px;color:var(--gray-500)">日均${avgDaily}</span></td>
        <td class="num-col">${turnoverBadge}</td>
        <td class="num-col">
          ${hasForecast
            ? `<div style="display:flex; align-items:center; justify-content:flex-end; gap:4px; flex-wrap:wrap;">
                 <span class="num-mono num-orange num-large" onclick="toggleExpand('${sku.id}')" style="cursor:pointer;">${formatNumber(replen.totalForecast)}</span>
                 ${promoDeltaBadge}
               </div>
               <div class="forecast-detail-toggle" onclick="toggleExpand('${sku.id}')" style="text-align:right;">${isExpanded ? '▲ 收起' : '▼ 展开7天'}</div>`
            : '<span class="badge badge-warning">待预测</span>'
          }
        </td>
        <td class="num-col">
          <div style="display:flex; align-items:center; justify-content:flex-end; gap:4px;">
            <span class="num-mono">${hasForecast ? formatNumber(replen.safetyStock) : '—'}</span>
            ${safetyTag}
          </div>
        </td>
        <td class="num-col">${caseSizeHtml}</td>
        <td class="num-col">${accuracyBadge}</td>
        <td class="num-col">
          ${hasForecast
            ? (replen.suggestedQty > 0
                ? `<span class="num-mono num-orange num-large">${formatNumber(replen.suggestedQty)}</span>`
                : '<span style="color:var(--green-500);font-weight:600;">✓ 充足</span>')
            : '—'
          }
        </td>
        <td class="num-col">
          ${hasForecast
            ? `<input type="number" class="editable-input" data-sku="${sku.id}" value="${replen.adjustedQty}" min="0">`
            : '<span style="color:var(--gray-300);">—</span>'
          }
        </td>
        <td class="num-col">
          ${hasForecast
            ? `<span class="num-mono ${replen.cases > 0 ? 'num-orange' : ''}">${replen.cases}</span>`
            : '—'
          }
        </td>
      </tr>
    `);
    if (isExpanded && hasForecast) {
      const forecastDaysHtml = AppState.futureDates.map((d, i) => {
        const hasPromo = skuPromoDates.has(d) ? 'promo-boosted' : '';
        const actual = sales.actualFuture[i];
        const pi = promoImpact?.[i];
        const deltaHtml = pi && pi.delta > 0
          ? `<div class="forecast-day-delta">+${pi.delta}</div>`
          : '';
        return `
          <div class="forecast-day ${hasPromo}">
            <div class="forecast-day-label">${d.slice(5).replace('-', '/')}${skuPromoDates.has(d) ? ' 🎯' : ''}</div>
            <div class="forecast-day-val">${forecast[i]}</div>
            ${deltaHtml}
            <div style="font-size:9px;color:var(--gray-500);">实:${actual}</div>
          </div>
        `;
      }).join('');
      rows.push(`
        <tr class="forecast-detail-row" data-parent="${sku.id}">
          <td colspan="15">
            <div style="display:flex; align-items:center; gap:16px; flex-wrap:wrap;">
              <div style="flex-shrink:0;">
                <span style="font-size:11px;color:var(--gray-500);font-weight:600;">📆 未来7天逐日预测 ${skuPromoDelta > 0 ? `<span class="promo-delta-badge">促销影响+${skuPromoDelta}</span>` : ''}：</span>
              </div>
              <div class="forecast-day-grid" style="flex:1; min-width:480px;">
                ${forecastDaysHtml}
              </div>
            </div>
          </td>
        </tr>
      `);
    }
  });
  tbody.innerHTML = rows.join('');
  setTimeout(() => {
    filteredSkus.forEach(sku => {
      const canvas = document.getElementById(`spark_${sku.id}`);
      if (canvas) {
        const sales = getSalesBySku(sku.id);
        const to = AppState.turnoverResults[sku.id];
        let color = getComputedStyle(document.documentElement).getPropertyValue('--blue-500').trim() || '#3498DB';
        if (to?.slowMoving) {
          color = getComputedStyle(document.documentElement).getPropertyValue('--red-500').trim() || '#E74C3C';
        } else if (to?.rate >= 2) {
          color = getComputedStyle(document.documentElement).getPropertyValue('--green-500').trim() || '#2ECC71';
        }
        drawSparkline(canvas, sales.history, color);
      }
    });
  }, 0);
  bindTableEvents();
  $('#alertCount').textContent = alertCount;
  $('#promoDelta').textContent = '+' + formatNumber(totalPromoDelta);
  updateAvgAccuracy();
}

function bindTableEvents() {
  $all('.row-check').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const skuId = e.target.dataset.sku;
      if (e.target.checked) AppState.selectedSkus.add(skuId);
      else AppState.selectedSkus.delete(skuId);
      renderTable();
    });
  });
  $all('.editable-input').forEach(inp => {
    inp.addEventListener('change', (e) => {
      const skuId = e.target.dataset.sku;
      let val = parseInt(e.target.value) || 0;
      val = Math.max(0, val);
      const sku = getSkuById(skuId);
      const replen = AppState.replenishmentResults[skuId];
      const newReplen = recalculateReplenishment(sku, replen, val);
      AppState.replenishmentResults[skuId] = newReplen;
      renderTable();
      updateKpiBuyAmount();
    });
  });
}

function toggleExpand(skuId) {
  if (AppState.expandedRows.has(skuId)) AppState.expandedRows.delete(skuId);
  else AppState.expandedRows.add(skuId);
  renderTable();
}

function getTurnoverBadge(rate) {
  if (rate < 1.0) return `<span class="badge badge-danger">${rate.toFixed(2)} ⚠️</span>`;
  else if (rate < 2.0) return `<span class="badge badge-warning">${rate.toFixed(2)}</span>`;
  return `<span class="badge badge-success">${rate.toFixed(2)}</span>`;
}

function getAccuracyBadge(acc) {
  if (acc >= 80) return `<span class="badge badge-success">${acc.toFixed(1)}%</span>`;
  else if (acc >= 60) return `<span class="badge badge-warning">${acc.toFixed(1)}%</span>`;
  return `<span class="badge badge-danger">${acc.toFixed(1)}%</span>`;
}

function getStockBadge(current, safety) {
  if (current < safety) return '<span style="font-size:10px; margin-left:4px;" class="badge badge-danger">⚠️低</span>';
  if (current < safety * 1.5) return '<span style="font-size:10px; margin-left:4px;" class="badge badge-warning">偏低</span>';
  return '';
}

function updateAvgAccuracy() {
  const vals = Object.values(AppState.accuracyResults);
  if (vals.length === 0) { $('#avgAccuracy').textContent = '—'; return; }
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  $('#avgAccuracy').textContent = avg.toFixed(1) + '%';
  $('#avgAccuracy').className = avg >= 80 ? 'badge badge-success' : (avg >= 60 ? 'badge badge-warning' : 'badge badge-danger');
}

function renderKpiBaseline() {
  let totalStockValue = 0, totalMonthSales = 0, slowCount = 0;
  let totalTurnoverWeighted = 0, totalMonthlyWeight = 0;
  SKU_DATA.forEach(sku => {
    const turnover = AppState.turnoverResults[sku.id];
    totalStockValue += sku.currentStock * sku.unitPrice;
    const monthRev = turnover.monthlySales * sku.unitPrice;
    totalMonthSales += monthRev;
    if (turnover.slowMoving) slowCount++;
    totalTurnoverWeighted += turnover.rate * turnover.monthlySales;
    totalMonthlyWeight += turnover.monthlySales;
  });
  const avgTurnover = totalMonthlyWeight > 0 ? totalTurnoverWeighted / totalMonthlyWeight : 0;
  $('#kpiStockValue').textContent = '¥' + formatLargeNumber(totalStockValue);
  $('#kpiMonthSales').textContent = '¥' + formatLargeNumber(totalMonthSales);
  $('#kpiTurnover').textContent = avgTurnover.toFixed(2);
  $('#kpiSlowMoving').textContent = slowCount;
  $('#kpiNeedBuy').textContent = 0;
  $('#kpiBuyAmount').textContent = '¥0';
  $('#kpiPromoDelta').textContent = '+0';
}

function renderKpiAfterForecast() {
  renderKpiBaseline();
  updateKpiBuyAmount();
  let totalPromoDelta = 0;
  Object.keys(AppState.promoImpacts).forEach(skuId => {
    AppState.promoImpacts[skuId].forEach(pi => { if (pi) totalPromoDelta += pi.delta; });
  });
  $('#kpiPromoDelta').textContent = '+' + formatNumber(totalPromoDelta);
}

function updateKpiBuyAmount() {
  let needCount = 0, buyAmount = 0;
  Object.keys(AppState.replenishmentResults).forEach(skuId => {
    const rep = AppState.replenishmentResults[skuId];
    const sku = getSkuById(skuId);
    if ((rep.needsReplenish || AppState.selectedSkus.has(skuId)) && rep.adjustedQty > 0) needCount++;
    if (AppState.selectedSkus.has(skuId)) {
      buyAmount += rep.adjustedQty * sku.unitPrice;
    }
  });
  $('#kpiNeedBuy').textContent = needCount;
  $('#kpiBuyAmount').textContent = '¥' + formatLargeNumber(buyAmount);
}

function formatLargeNumber(n) {
  if (n >= 10000) return (n / 10000).toFixed(2) + '万';
  return Math.round(n).toLocaleString('zh-CN');
}

document.addEventListener('DOMContentLoaded', initApp);
