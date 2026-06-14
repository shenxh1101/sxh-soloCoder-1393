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
  baseForecastResults: {},
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
  scenarios: { base: null, conservative: null, aggressive: null },
  selectedScenario: null,
  skuOverrides: {},
  confirmTab: 'items',
  _initialized: false
};

const CATEGORY_EMOJI = {
  '饮料': '🥤', '零食': '🍿', '方便食品': '🍜', '乳制品': '🥛',
  '调味品': '🧂', '个护': '🧴', '日用': '🧻'
};

const SCENARIO_META = {
  base: { label: '基准方案', dot: 'base', desc: '当前参数的默认预测', icon: '🟢' },
  conservative: { label: '保守方案', dot: 'conservative', desc: '高安全库存+低促销弹性', icon: '🟡' },
  aggressive: { label: '促销冲量', dot: 'aggressive', desc: '强化促销+高预测系数', icon: '🔴' }
};

function $(sel, root = document) { return root.querySelector(sel); }
function $all(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

/* ========== 初始化 ========== */
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

/* ========== 事件绑定 ========== */
function bindEvents() {
  $('#runForecastBtn').addEventListener('click', runFullForecast);
  $('#runCompareBtn').addEventListener('click', openCompareModal);
  $('#compareBtn').addEventListener('click', openCompareModal);
  $('#runCompareAgainBtn').addEventListener('click', () => runCompare(true));
  $('#applyMABtn').addEventListener('click', () => applyComparePlan('movingAverage'));
  $('#applyESBtn').addEventListener('click', () => applyComparePlan('exponentialSmoothing'));
  $('#cancelCompareBtn').addEventListener('click', closeCompareModal);
  $('#closeCompareModal').addEventListener('click', closeCompareModal);

  $('#scenarioBtn').addEventListener('click', openScenarioModal);
  $('#closeScenarioModal').addEventListener('click', closeScenarioModal);
  $('#cancelScenarioBtn').addEventListener('click', closeScenarioModal);
  $('#saveAsBaseBtn').addEventListener('click', () => saveCurrentAsScenario('base'));
  $('#saveAsConservativeBtn').addEventListener('click', () => saveCurrentAsScenario('conservative'));
  $('#saveAsAggressiveBtn').addEventListener('click', () => saveCurrentAsScenario('aggressive'));
  $('#rebuildAllScenariosBtn').addEventListener('click', rebuildAllScenarios);
  $('#applyScenarioBtn').addEventListener('click', applySelectedScenario);
  $all('#scenarioTabs .scenario-tab').forEach(t => {
    t.addEventListener('click', () => {
      $all('#scenarioTabs .scenario-tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
    });
  });
  $('#scenarioModal').addEventListener('click', (e) => {
    if (e.target.id === 'scenarioModal') closeScenarioModal();
  });

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
    if (Object.keys(AppState.replenishmentResults).length > 0) quickRefreshReplenishment();
  });
  $('#caseSizeInput').addEventListener('change', (e) => {
    AppState.params.globalCaseSize = parseInt(e.target.value) || 12;
    if (Object.keys(AppState.replenishmentResults).length > 0) quickRefreshReplenishment();
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
  $('#exportSupplierAllBtn').addEventListener('click', doExportAllSupplier);
  $('#confirmModal').addEventListener('click', (e) => {
    if (e.target.id === 'confirmModal') closeConfirmModal();
  });
  $all('#confirmTabBar .tab-item').forEach(t => {
    t.addEventListener('click', () => {
      const tab = t.dataset.tab;
      AppState.confirmTab = tab;
      $all('#confirmTabBar .tab-item').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      $('#confirmItemsPanel').style.display = tab === 'items' ? 'block' : 'none';
      $('#confirmSupplierPanel').style.display = tab === 'suppliers' ? 'block' : 'none';
    });
  });

  toggleAlphaGroup();
}

function toggleAlphaGroup() {
  $('#alphaGroup').style.display = AppState.params.method === 'exponentialSmoothing' ? 'block' : 'none';
}

/* ========== 规则覆盖：门店默认 vs 单品覆盖 ========== */
function hasOverride(skuId, field) {
  return !!(AppState.skuOverrides[skuId] && AppState.skuOverrides[skuId][field] !== undefined);
}

function getOverride(skuId, field) {
  return AppState.skuOverrides[skuId]?.[field];
}

function setOverride(skuId, field, value) {
  if (!AppState.skuOverrides[skuId]) AppState.skuOverrides[skuId] = {};
  AppState.skuOverrides[skuId][field] = value;
}

function clearOverride(skuId, field) {
  if (AppState.skuOverrides[skuId]) {
    delete AppState.skuOverrides[skuId][field];
    if (Object.keys(AppState.skuOverrides[skuId]).length === 0) {
      delete AppState.skuOverrides[skuId];
    }
  }
}

function toggleOverride(skuId, field) {
  const sku = getSkuById(skuId);
  if (hasOverride(skuId, field)) {
    clearOverride(skuId, field);
  } else {
    const val = field === 'safetyDays'
      ? (sku.safetyStockDays || AppState.params.globalSafetyDays)
      : (sku.caseSize || AppState.params.globalCaseSize);
    setOverride(skuId, field, val);
  }
  if (Object.keys(AppState.replenishmentResults).length > 0) quickRefreshReplenishment();
}

function updateOverrideValue(skuId, field, value) {
  const v = parseInt(value) || 1;
  setOverride(skuId, field, Math.max(1, v));
  if (Object.keys(AppState.replenishmentResults).length > 0) quickRefreshReplenishment();
}

function getSkuOverrideMap(skuId) {
  return AppState.skuOverrides[skuId] || {};
}

/* ========== 预测/补货核心 ========== */
function quickRefreshReplenishment() {
  if (!AppState.forecastResults || Object.keys(AppState.forecastResults).length === 0) return;
  const skuOverrideMap = {};
  SKU_DATA.forEach(s => { skuOverrideMap[s.id] = getSkuOverrideMap(s.id); });
  AppState.replenishmentResults = calculateAllReplenishment(
    AppState.forecastResults,
    AppState.baseForecastResults,
    AppState.params,
    AppState.promotions,
    AppState.futureDates,
    skuOverrideMap
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
    AppState.baseForecastResults = result.baseForecast || {};
    AppState.promoImpacts = result.promoImpacts || {};
    AppState.accuracyResults = calculateAccuracyForAll(AppState.forecastResults);
    const skuOverrideMap = {};
    SKU_DATA.forEach(s => { skuOverrideMap[s.id] = getSkuOverrideMap(s.id); });
    AppState.replenishmentResults = calculateAllReplenishment(
      AppState.forecastResults,
      AppState.baseForecastResults,
      AppState.params,
      AppState.promotions,
      AppState.futureDates,
      skuOverrideMap
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

/* ========== 算法对比弹窗 ========== */
function openCompareModal() {
  $('#compareModal').classList.add('active');
  if (!AppState.compareResults) runCompare(false);
  else renderCompareTable();
}

function closeCompareModal() { $('#compareModal').classList.remove('active'); }

function runCompare(animate) {
  const btn = $('#runCompareAgainBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 计算中...'; }
  setTimeout(() => {
    const skuOverrideMap = {};
    SKU_DATA.forEach(s => { skuOverrideMap[s.id] = getSkuOverrideMap(s.id); });
    AppState.compareResults = compareTwoPlans(
      AppState.params, AppState.promotions, AppState.futureDates, skuOverrideMap
    );
    renderCompareTable();
    if (btn) { btn.disabled = false; btn.textContent = '🔄 重新计算'; }
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
    maAmount += (ma.replenishment[id]?.purchaseAmount || 0);
    esAmount += (es.replenishment[id]?.purchaseAmount || 0);
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
    const maAmt = maR?.purchaseAmount || 0;
    const esAmt = esR?.purchaseAmount || 0;
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
  AppState.baseForecastResults = plan.baseForecast || {};
  AppState.promoImpacts = plan.promoImpacts || {};
  AppState.accuracyResults = plan.accuracy;
  AppState.replenishmentResults = plan.replenishment;
  AppState.params.method = method;
  $('#forecastMethod').value = method;
  toggleAlphaGroup();
  Object.keys(AppState.replenishmentResults).forEach(id => {
    if (AppState.replenishmentResults[id].needsReplenish) AppState.selectedSkus.add(id);
  });
  renderTable(true);
  renderKpiAfterForecast();
  closeCompareModal();
}

/* ========== 情景沙盘 ========== */
function openScenarioModal() {
  $('#scenarioModal').classList.add('active');
  renderScenarioCompareGrid();
  updateScenarioTabMeta();
}

function closeScenarioModal() { $('#scenarioModal').classList.remove('active'); }

function saveCurrentAsScenario(key) {
  if (Object.keys(AppState.replenishmentResults).length === 0) {
    runFullForecast();
  }
  const skuOverrideMap = {};
  SKU_DATA.forEach(s => { skuOverrideMap[s.id] = getSkuOverrideMap(s.id); });
  AppState.scenarios[key] = buildScenarioPlan(
    SCENARIO_META[key].label,
    AppState.params,
    AppState.forecastResults,
    AppState.baseForecastResults,
    AppState.promoImpacts || {},
    AppState.accuracyResults,
    AppState.replenishmentResults
  );
  updateScenarioTabMeta();
  renderScenarioCompareGrid();
}

function rebuildAllScenarios() {
  const originalParams = JSON.parse(JSON.stringify(AppState.params));
  const originalPromos = JSON.parse(JSON.stringify(AppState.promotions));
  const skuOverrideMap = {};
  SKU_DATA.forEach(s => { skuOverrideMap[s.id] = getSkuOverrideMap(s.id); });

  AppState.params.method = 'movingAverage';
  AppState.params.windowSize = 5;
  AppState.params.globalSafetyDays = 3;
  AppState.params.globalCaseSize = 12;
  AppState.scenarios.base = buildScenarioPlanFromScratch('基准方案', AppState.params, originalPromos, AppState.futureDates, skuOverrideMap);

  AppState.params.globalSafetyDays = 6;
  AppState.params.globalCaseSize = 24;
  AppState.scenarios.conservative = buildScenarioPlanFromScratch('保守方案', AppState.params, originalPromos, AppState.futureDates, skuOverrideMap);

  AppState.params.globalSafetyDays = 2;
  AppState.params.windowSize = 3;
  const boostedPromos = originalPromos.map(p => ({ ...p, impactFactor: Math.min(3, (p.impactFactor || 1.3) * 1.2) }));
  AppState.scenarios.aggressive = buildScenarioPlanFromScratch('促销冲量', AppState.params, boostedPromos, AppState.futureDates, skuOverrideMap);

  Object.assign(AppState.params, originalParams);
  AppState.promotions = originalPromos;
  updateScenarioTabMeta();
  renderScenarioCompareGrid();
}

function buildScenarioPlanFromScratch(name, params, promotions, futureDates, skuOverrideMap) {
  const r = runForecastForAll(params, promotions, futureDates);
  const accuracy = calculateAccuracyForAll(r.forecast);
  const replenishment = calculateAllReplenishment(
    r.forecast, r.baseForecast, params, promotions, futureDates, skuOverrideMap
  );
  return buildScenarioPlan(name, params, r.forecast, r.baseForecast, r.promoImpacts || {}, accuracy, replenishment);
}

function updateScenarioTabMeta() {
  ['base', 'conservative', 'aggressive'].forEach(k => {
    const meta = $('#' + k + 'Meta');
    if (!meta) return;
    const s = AppState.scenarios[k];
    meta.textContent = s ? `（${s.savedAt?.slice(5) || '已保存'}）` : '（未保存）';
  });
}

function renderScenarioCompareGrid() {
  const grid = $('#scenarioCompareGrid');
  const keys = ['base', 'conservative', 'aggressive'].filter(k => AppState.scenarios[k]);
  if (keys.length === 0) {
    grid.innerHTML = `
      <div class="empty-state-mini" style="grid-column:1/-1;">
        <div class="empty-icon">🎯</div>
        <div>暂无已保存的方案</div>
        <div>点击上方按钮保存当前配置为方案，或「按当前参数重新生成三套」</div>
      </div>`;
    return;
  }
  const cards = keys.map(k => {
    const s = AppState.scenarios[k];
    const meta = SCENARIO_META[k];
    const selected = AppState.selectedScenario === k ? 'selected' : '';
    return `
      <div class="scenario-card ${selected}" data-key="${k}" onclick="selectScenarioCard('${k}')">
        <div class="scenario-card-header">
          <div>
            <div class="scenario-card-title">${meta.icon} ${meta.label}</div>
            <div class="scenario-card-desc">${meta.desc} · 保存于 ${s.savedAt}</div>
          </div>
        </div>
        <div class="scenario-metrics">
          <div class="scenario-metric-row">
            <span class="scenario-metric-label">7天预测总量</span>
            <span class="scenario-metric-value">${formatNumber(s.summary.totalForecast7Days)}</span>
          </div>
          <div class="scenario-metric-row">
            <span class="scenario-metric-label">平均准确率</span>
            <span class="scenario-metric-value">${s.summary.avgAccuracy.toFixed(1)}%</span>
          </div>
          <div class="scenario-metric-row">
            <span class="scenario-metric-label">建议补货总量</span>
            <span class="scenario-metric-value orange">${formatNumber(s.summary.totalSuggestedQty)}</span>
          </div>
          <div class="scenario-metric-row">
            <span class="scenario-metric-label">采购总金额</span>
            <span class="scenario-metric-value orange">¥${formatNumber(s.summary.totalPurchaseAmount)}</span>
          </div>
          <div class="scenario-metric-row">
            <span class="scenario-metric-label">高缺货风险 SKU</span>
            <span class="scenario-metric-value ${s.summary.highRiskCount > 0 ? 'red' : 'green'}">${s.summary.highRiskCount}</span>
          </div>
          <div class="scenario-metric-row">
            <span class="scenario-metric-label">平均到货后覆盖</span>
            <span class="scenario-metric-value">${s.summary.avgCoverageDays.toFixed(1)}天</span>
          </div>
          <div class="scenario-metric-row">
            <span class="scenario-metric-label">预计毛利</span>
            <span class="scenario-metric-value green">¥${formatNumber(s.summary.totalGrossProfit)}</span>
          </div>
          <div class="scenario-metric-row">
            <span class="scenario-metric-label">需采购 SKU</span>
            <span class="scenario-metric-value">${s.summary.needBuyCount}</span>
          </div>
        </div>
      </div>
    `;
  });
  grid.innerHTML = cards.join('');
  grid.style.gridTemplateColumns = `repeat(${Math.min(3, keys.length)}, 1fr)`;
}

function selectScenarioCard(key) {
  AppState.selectedScenario = AppState.selectedScenario === key ? null : key;
  renderScenarioCompareGrid();
}

function applySelectedScenario() {
  const key = AppState.selectedScenario;
  if (!key || !AppState.scenarios[key]) {
    alert('请先在上方选择一个方案卡片');
    return;
  }
  const s = AppState.scenarios[key];
  Object.assign(AppState.params, s.params);
  $('#forecastMethod').value = AppState.params.method;
  toggleAlphaGroup();
  $('#alphaSlider').value = AppState.params.alpha;
  $('#alphaValue').textContent = AppState.params.alpha.toFixed(2);
  $all('input[name="windowSize"]').forEach(r => { r.checked = parseInt(r.value) === AppState.params.windowSize; });
  $('#safetySlider').value = AppState.params.globalSafetyDays;
  $('#safetyValue').textContent = AppState.params.globalSafetyDays + ' 天';
  $('#caseSizeInput').value = AppState.params.globalCaseSize;

  AppState.promotions = JSON.parse(JSON.stringify(s.promotions || []));
  if (s.skuOverrides) {
    AppState.skuOverrides = JSON.parse(JSON.stringify(s.skuOverrides));
  }
  AppState.forecastResults = s.forecast;
  AppState.baseForecastResults = s.baseForecast || {};
  AppState.accuracyResults = s.accuracy;
  AppState.replenishmentResults = s.replenishment;
  Object.keys(AppState.replenishmentResults).forEach(id => {
    if (AppState.replenishmentResults[id].needsReplenish) AppState.selectedSkus.add(id);
  });
  renderPromoList();
  renderTable(true);
  renderKpiAfterForecast();
  closeScenarioModal();
  alert(`✅ 已应用「${SCENARIO_META[key].label}」到主表`);
}

/* ========== 促销管理 ========== */
function openPromoModal() {
  $('#promoModal').classList.add('active');
  updatePromoPreview();
}
function closePromoModal() { $('#promoModal').classList.remove('active'); }

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
    📊 预计影响 <strong>${skuCount} 个SKU × ${dayCount} 天</strong>，支持多活动叠加
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
  const promo = { id: 'PROMO' + Date.now(), name: promoName, scope, discount, impactFactor, startDate, endDate };
  if (scope === 'single') promo.skuId = $('#promoSkuSelect').value;
  else if (scope === 'category') {
    promo.category = $('#promoCategorySelect').value;
    if (!promo.category) { alert('请选择促销分类！'); return; }
  }
  AppState.promotions.push(promo);
  AppState.promotions.sort((a, b) => a.startDate.localeCompare(b.startDate));
  renderPromoList();
  if (Object.keys(AppState.forecastResults).length > 0) runFullForecast();
  closePromoModal();
}

function removePromotion(id) {
  AppState.promotions = AppState.promotions.filter(p => p.id !== id);
  renderPromoList();
  if (Object.keys(AppState.forecastResults).length > 0) runFullForecast();
}

function renderPromoList() {
  const list = $('#promoList');
  if (AppState.promotions.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🎉</div>
        <div>暂无活动计划</div>
        <div style="margin-top: 4px;">点击「新增」添加促销活动（支持整店/按分类/单SKU + 多活动叠加）</div>
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

/* ========== 采购确认页（Tab版） ========== */
function openConfirmModal() {
  if (AppState.selectedSkus.size === 0) { alert('请先在表格中勾选需要采购的商品！'); return; }
  if (Object.keys(AppState.replenishmentResults).length === 0) { alert('请先点击「运行预测」生成补货建议！'); return; }
  AppState.confirmTab = 'items';
  $all('#confirmTabBar .tab-item').forEach((t, i) => {
    t.classList.toggle('active', i === 0);
  });
  $('#confirmItemsPanel').style.display = 'block';
  $('#confirmSupplierPanel').style.display = 'none';
  renderConfirmPage();
  renderSupplierPanel();
  $('#confirmModal').classList.add('active');
}

function closeConfirmModal() { $('#confirmModal').classList.remove('active'); }

function renderConfirmPage() {
  const tbody = $('#confirmTableBody');
  const rows = [];
  let totalQty = 0, totalCases = 0, totalAmount = 0, totalCoverage = 0;
  let totalPromoExtra = 0, totalGrossProfit = 0, count = 0, highRiskCount = 0;
  const supplierIds = new Set();
  AppState.selectedSkus.forEach(skuId => {
    const sku = getSkuById(skuId);
    const rep = AppState.replenishmentResults[skuId];
    if (!rep || rep.adjustedQty <= 0) return;
    const qty = rep.adjustedQty;
    const cases = rep.cases;
    const amount = rep.purchaseAmount;
    const stockAfter = sku.currentStock + qty;
    const coverage = rep.coverageDaysAfterOrder;
    if (rep.supplierId) supplierIds.add(rep.supplierId);
    totalQty += qty; totalCases += cases; totalAmount += amount;
    totalCoverage += coverage; totalPromoExtra += (rep.promoExtraQty || 0);
    totalGrossProfit += (rep.grossProfit?.orderProfit || 0);
    if (rep.stockoutRisk?.risk === 'high') highRiskCount++;
    count++;
    let covClass = 'coverage-good';
    if (coverage < 7) covClass = 'coverage-low';
    else if (coverage < 14) covClass = 'coverage-warning';
    const emoji = CATEGORY_EMOJI[sku.category] || '📦';
    const supplier = getSupplierById(rep.supplierId);
    const riskHtml = riskBadge(rep.stockoutRisk);
    const qtySplitHtml = `
      <div class="qty-split">
        <span class="base">基 ${formatNumber(rep.baseSuggestedQty || 0)}</span>
        ${(rep.promoExtraQty || 0) > 0 ? `<span class="promo">增 +${formatNumber(rep.promoExtraQty)}</span>` : ''}
        <span class="total">合 ${formatNumber(qty)}</span>
      </div>`;
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
        <td>${supplier?.name || '—'}</td>
        <td><span class="category-tag">${sku.category}</span></td>
        <td class="num-col num-mono">¥${sku.unitPrice.toFixed(2)}</td>
        <td class="num-col num-mono">${formatNumber(sku.currentStock)}</td>
        <td class="num-col num-mono">${formatNumber(rep.totalForecast)}</td>
        <td class="num-col num-mono">${formatNumber(rep.safetyStock)}</td>
        <td class="num-col">${riskHtml}</td>
        <td class="num-col num-mono">${rep.caseSize}</td>
        <td class="num-col num-mono">${cases}</td>
        <td class="num-col">${qtySplitHtml}</td>
        <td class="num-col num-mono num-orange">¥${formatNumber(amount)}</td>
        <td class="num-col num-mono" style="color:var(--green-500);">¥${formatNumber(rep.grossProfit?.orderProfit || 0)}</td>
        <td class="num-col num-mono">${formatNumber(stockAfter)}</td>
        <td class="num-col num-mono ${covClass}">${coverage.toFixed(1)}天</td>
        <td class="num-col num-mono">${rep.arrivalDate || '—'}</td>
      </tr>
    `);
  });
  const avgCoverage = count > 0 ? (totalCoverage / count) : 0;
  const methodName = AppState.params.method === 'movingAverage'
    ? `移动平均法(${AppState.params.windowSize}天)`
    : `指数平滑法(α=${AppState.params.alpha})`;
  $('#confirmSkuCount').textContent = count;
  $('#confirmSupplierCount').textContent = supplierIds.size;
  $('#confirmTotalCases').textContent = totalCases;
  $('#confirmTotalQty').textContent = formatNumber(totalQty);
  $('#confirmPromoExtraQty').textContent = '+' + formatNumber(totalPromoExtra);
  $('#confirmTotalAmount').textContent = '¥' + formatNumber(Math.round(totalAmount * 100) / 100);
  $('#confirmGrossProfit').textContent = '¥' + formatNumber(Math.round(totalGrossProfit * 100) / 100);
  $('#confirmAvgCoverage').textContent = avgCoverage.toFixed(1) + '天';
  $('#confirmHighRiskCount').textContent = highRiskCount;
  $('#confirmMethodName').textContent = methodName;
  $('#confirmPromoCount').textContent = AppState.promotions.length;
  $('#tabItemsBadge').textContent = count;
  $('#tabSupplierBadge').textContent = supplierIds.size;
  rows.push(`
    <tr class="confirm-summary-row">
      <td colspan="9" style="text-align:left;"><strong>✅ 合计 ${count} 个SKU / ${supplierIds.size} 家供应商</strong></td>
      <td class="num-col"><strong>${totalCases}</strong></td>
      <td class="num-col"><strong>${formatNumber(totalQty)}</strong></td>
      <td class="num-col"><strong>¥${formatNumber(Math.round(totalAmount))}</strong></td>
      <td class="num-col"><strong>¥${formatNumber(Math.round(totalGrossProfit))}</strong></td>
      <td class="num-col">—</td>
      <td class="num-col" colspan="2"><strong>平均 ${avgCoverage.toFixed(1)}天</strong></td>
    </tr>
  `);
  tbody.innerHTML = rows.join('');
}

function renderSupplierPanel() {
  const panel = $('#confirmSupplierPanel');
  const groups = groupBySupplier(AppState.replenishmentResults, Array.from(AppState.selectedSkus));
  const groupArr = Object.values(groups).sort((a, b) => b.totalAmount - a.totalAmount);
  if (groupArr.length === 0) {
    panel.innerHTML = `<div class="empty-state-mini"><div class="empty-icon">🏭</div><div>暂无供应商数据</div></div>`;
    return;
  }
  panel.innerHTML = groupArr.map(g => {
    const meetsCls = g.meetsMinOrder ? 'ok' : 'warn';
    const meetsTxt = g.meetsMinOrder ? '✓ 已达起订额' : `⚠ 差 ¥${formatNumber(g.minOrderAmount - g.totalAmount)}`;
    const subRows = g.items.map(item => {
      const sku = getSkuById(item.skuId);
      return `
        <tr>
          <td>
            <div class="sku-info" style="gap:8px;">
              <div class="sku-avatar" style="width:28px;height:28px;font-size:14px;">${CATEGORY_EMOJI[sku.category] || '📦'}</div>
              <div class="sku-text">
                <div class="sku-name" style="font-size:12px;">${item.skuName}</div>
                <div class="sku-id">${item.skuId}</div>
              </div>
            </div>
          </td>
          <td class="num-mono">${item.caseSize}</td>
          <td class="num-mono">${sku.minOrderCases || 0}</td>
          <td class="num-mono">${item.cases}</td>
          <td class="num-mono" style="color:var(--navy-700);">${formatNumber(item.baseQty)}</td>
          <td class="num-mono" style="color:var(--orange-500);font-weight:700;">${item.promoExtraQty > 0 ? '+' + formatNumber(item.promoExtraQty) : '0'}</td>
          <td class="num-mono" style="font-weight:700;">${formatNumber(item.orderQty)}</td>
          <td class="num-mono">¥${item.unitPrice.toFixed(2)}</td>
          <td class="num-mono num-orange" style="font-weight:700;">¥${formatNumber(item.amount)}</td>
        </tr>
      `;
    }).join('') + `
      <tr class="total-row">
        <td style="font-weight:700;">📋 合计 · ${g.items.length}个SKU</td>
        <td>—</td>
        <td>—</td>
        <td style="font-weight:700;">${g.totalCases}</td>
        <td style="font-weight:700;">${formatNumber(g.totalQty - g.promoExtraQty)}</td>
        <td style="font-weight:700;">+${formatNumber(g.promoExtraQty)}</td>
        <td style="font-weight:700;">${formatNumber(g.totalQty)}</td>
        <td>—</td>
        <td style="font-weight:700;">¥${formatNumber(g.totalAmount)}</td>
      </tr>
    `;
    return `
      <div class="supplier-card">
        <div class="supplier-card-header">
          <div class="supplier-name-row">
            <div class="supplier-name">🏭 ${g.supplierName}</div>
            <div class="supplier-contact">👤 ${g.contact} · 📞 ${g.phone}</div>
          </div>
          <div class="supplier-metrics">
            <span class="supplier-metric">📦 <strong>${g.totalCases}</strong>箱</span>
            <span class="supplier-metric">🛒 <strong>${formatNumber(g.totalQty)}</strong>件</span>
            <span class="supplier-metric">💰 <strong>¥${formatNumber(g.totalAmount)}</strong></span>
            <span class="supplier-metric">🚚 预计 <strong>${g.arrivalDate}</strong>到货</span>
            <span class="min-order-tag ${meetsCls}">${meetsTxt}</span>
            <button class="supplier-card-btn" onclick="exportOneSupplier('${g.supplierId}')">📥 单独导出</button>
          </div>
        </div>
        <table class="supplier-sub-table">
          <thead>
            <tr>
              <th style="min-width:200px;">商品</th>
              <th class="num-col">箱规</th>
              <th class="num-col">起订箱</th>
              <th class="num-col">订货箱</th>
              <th class="num-col">基础数量</th>
              <th class="num-col">活动增量</th>
              <th class="num-col">总数量</th>
              <th class="num-col">单价</th>
              <th class="num-col">金额</th>
            </tr>
          </thead>
          <tbody>${subRows}</tbody>
        </table>
      </div>
    `;
  }).join('');
}

function exportOneSupplier(supplierId) {
  exportSingleSupplier(
    Array.from(AppState.selectedSkus),
    AppState.replenishmentResults,
    supplierId,
    AppState.futureDates
  );
}

function doFinalExport() {
  if (AppState.selectedSkus.size === 0) { alert('没有选中的商品！'); return; }
  exportPurchaseOrder(
    Array.from(AppState.selectedSkus),
    AppState.replenishmentResults,
    AppState.futureDates,
    null,
    'combined'
  );
  closeConfirmModal();
}

function doExportAllSupplier() {
  if (AppState.selectedSkus.size === 0) { alert('没有选中的商品！'); return; }
  const groups = groupBySupplier(AppState.replenishmentResults, Array.from(AppState.selectedSkus));
  Object.keys(groups).forEach(sid => {
    exportSingleSupplier(
      Array.from(AppState.selectedSkus),
      AppState.replenishmentResults,
      sid,
      AppState.futureDates
    );
  });
  alert(`✅ 已导出 ${Object.keys(groups).length} 个供应商的分单 Excel`);
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
    if (promoImpact) promoImpact.forEach(pi => { if (pi) skuPromoDelta += pi.delta; });
    totalPromoDelta += skuPromoDelta;
    const avgDaily = Math.round(turnover.monthlySales / 30);
    const turnoverBadge = getTurnoverBadge(turnover.rate);
    const accuracyBadge = hasForecast ? getAccuracyBadge(accuracy) : '<span class="badge badge-warning">待预测</span>';
    const stockBadge = replen ? getStockBadge(replen.currentStock, replen.safetyStock) : '';
    const sparkId = `spark_${sku.id}`;
    const skuPromoDates = new Set();
    AppState.promotions.forEach(p => {
      const affectedSkus = getPromoAffectedSkus(p);
      if (affectedSkus.includes(sku.id)) expandPromoDateRange(p).forEach(d => skuPromoDates.add(d));
    });
    const isExpanded = AppState.expandedRows.has(sku.id);
    const slowClass = turnover.slowMoving ? 'slow-moving' : '';
    const animClass = animate ? 'updated' : '';
    const animDelay = animate ? `style="animation-delay: ${idx * 0.05}s"` : '';
    const checkboxChecked = AppState.selectedSkus.has(sku.id) ? 'checked' : '';
    const categoryEmoji = CATEGORY_EMOJI[sku.category] || '📦';
    const supplier = getSupplierById(sku.supplierId);

    const safetyOverride = hasOverride(sku.id, 'safetyDays');
    const caseOverride = hasOverride(sku.id, 'caseSize');

    const safetySource = replen?.safetyStockSource || 'global';
    const caseSource = replen?.caseSizeSource || 'global';
    const overSafetyVal = getOverride(sku.id, 'safetyDays');
    const overCaseVal = getOverride(sku.id, 'caseSize');

    const safetyCell = hasForecast
      ? `<div style="display:flex; align-items:center; justify-content:flex-end; gap:4px; flex-wrap:wrap;">
           <span class="num-mono">${formatNumber(replen.safetyStock)}</span>
           ${safetyOverride
              ? `<span class="rule-tag override" title="单品覆盖，点击切回门店默认" onclick="toggleOverride('${sku.id}','safetyDays')" style="cursor:pointer;">覆盖 ${overSafetyVal}天</span>`
              : `<span class="rule-switch-btn" onclick="toggleOverride('${sku.id}','safetyDays')">${safetySource === 'sku' ? '商品内置' : '门店默认'} · 改</span>`}
         </div>
         ${safetyOverride
            ? `<div class="inline-edit-row" style="justify-content:flex-end; margin-top:4px;">
                 <input type="number" min="1" max="30" value="${overSafetyVal}" onchange="updateOverrideValue('${sku.id}','safetyDays', this.value)">
                 <span style="font-size:10px;color:var(--gray-500);">天</span>
               </div>` : ''}`
      : '—';

    const caseSizeCell = hasForecast
      ? `<div style="display:flex; align-items:center; justify-content:flex-end; gap:4px; flex-wrap:wrap;">
           <span class="num-mono">${replen.caseSize}</span>
           ${caseOverride
              ? `<span class="rule-tag override" title="单品覆盖，点击切回门店默认" onclick="toggleOverride('${sku.id}','caseSize')" style="cursor:pointer;">覆盖 ${overCaseVal}</span>`
              : `<span class="rule-switch-btn" onclick="toggleOverride('${sku.id}','caseSize')">${caseSource === 'sku' ? '商品内置' : '门店默认'} · 改</span>`}
         </div>
         ${caseOverride
            ? `<div class="inline-edit-row" style="justify-content:flex-end; margin-top:4px;">
                 <input type="number" min="1" max="200" value="${overCaseVal}" onchange="updateOverrideValue('${sku.id}','caseSize', this.value)">
                 <span style="font-size:10px;color:var(--gray-500);">瓶/箱</span>
               </div>` : ''}`
      : '—';

    const promoDeltaBadge = (hasForecast && skuPromoDelta > 0)
      ? `<span class="promo-delta-badge" title="促销抬高销量+${skuPromoDelta}">+${skuPromoDelta}</span>`
      : '';

    const forecastSplitCell = hasForecast
      ? `<div style="display:flex; align-items:center; justify-content:flex-end; gap:4px; flex-wrap:wrap;">
           <div class="forecast-split-row" style="align-items:flex-end; cursor:pointer;" onclick="toggleExpand('${sku.id}')">
             <span class="forecast-split-base">基 ${formatNumber(replen.baseTotalForecast || 0)}</span>
             ${skuPromoDelta > 0 ? `<span class="forecast-split-promo">增 +${skuPromoDelta}</span>` : ''}
             <span class="forecast-split-total">合 ${formatNumber(replen.totalForecast)}</span>
           </div>
           ${promoDeltaBadge}
         </div>
         <div class="forecast-detail-toggle" onclick="toggleExpand('${sku.id}')" style="text-align:right;">${isExpanded ? '▲ 收起' : '▼ 展开7天'}</div>`
      : '<span class="badge badge-warning">待预测</span>';

    const suggestedCell = hasForecast
      ? (replen.suggestedQty > 0
          ? `<div class="qty-split">
               <span class="base">基 ${formatNumber(replen.baseSuggestedQty || 0)}</span>
               ${(replen.promoExtraQty || 0) > 0 ? `<span class="promo">增 +${formatNumber(replen.promoExtraQty)}</span>` : ''}
               <span class="total num-orange" style="font-size:13px;">合 ${formatNumber(replen.suggestedQty)}</span>
             </div>`
          : '<span style="color:var(--green-500);font-weight:600;">✓ 充足</span>')
      : '—';

    const purchaseAmountCell = hasForecast
      ? `<span class="num-mono num-orange" style="font-weight:700;">¥${formatNumber(replen.purchaseAmount || 0)}</span>`
      : '—';

    const riskCell = hasForecast
      ? riskBadge(replen.stockoutRisk)
      : '<span class="badge badge-gray">—</span>';

    rows.push(`
      <tr class="${slowClass} ${animClass}" ${animDelay} data-sku="${sku.id}">
        <td><input type="checkbox" class="row-check" data-sku="${sku.id}" ${checkboxChecked}></td>
        <td>
          <div class="sku-info">
            <div class="sku-avatar">${categoryEmoji}</div>
            <div class="sku-text">
              <div class="sku-name">${sku.name}</div>
              <div class="sku-row-name-wrap" style="margin-top:2px;">
                <div class="sku-rule-tags">
                  <span class="sku-sup-tag">${supplier?.name || '—'}</span>
                  ${skuPromoDelta > 0 ? '<span class="rule-tag override" style="padding:1px 5px;font-size:9.5px;">🎯 有活动</span>' : ''}
                </div>
                <div class="sku-id">${sku.id}</div>
              </div>
            </div>
          </div>
        </td>
        <td><span class="category-tag">${sku.category}</span></td>
        <td><span class="sku-sup-tag" style="font-size:11px;">${supplier?.name || '—'}</span></td>
        <td class="num-col num-mono">¥${sku.unitPrice.toFixed(2)}</td>
        <td class="num-col">
          <span class="num-mono ${replen && replen.currentStock < replen.safetyStock ? 'num-negative' : ''}">
            ${formatNumber(sku.currentStock)}
          </span>
          ${stockBadge}
        </td>
        <td><canvas id="${sparkId}" class="sparkline-canvas" width="90" height="26"></canvas></td>
        <td class="num-col num-mono">${formatNumber(turnover.monthlySales)}<br><span style="font-size:10px;color:var(--gray-500)">日均${avgDaily}</span></td>
        <td class="num-col">${turnoverBadge}</td>
        <td class="num-col">${forecastSplitCell}</td>
        <td class="num-col">${riskCell}</td>
        <td class="num-col">${safetyCell}</td>
        <td class="num-col">${caseSizeCell}</td>
        <td class="num-col">${accuracyBadge}</td>
        <td class="num-col">${suggestedCell}</td>
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
        <td class="num-col">${purchaseAmountCell}</td>
      </tr>
    `);
    if (isExpanded && hasForecast) {
      const forecastDaysHtml = AppState.futureDates.map((d, i) => {
        const hasPromo = skuPromoDates.has(d) ? 'promo-boosted' : '';
        const actual = sales.actualFuture[i];
        const pi = promoImpact?.[i];
        const base = replen.baseForecast7Days?.[i] || 0;
        const boosted = forecast[i];
        const delta = Math.max(0, boosted - base);
        const deltaHtml = delta > 0
          ? `<div class="forecast-day-delta">+${delta}</div>`
          : '';
        return `
          <div class="forecast-day ${hasPromo}">
            <div class="forecast-day-label">${d.slice(5).replace('-', '/')}${skuPromoDates.has(d) ? ' 🎯' : ''}</div>
            <div class="forecast-day-val">${boosted}</div>
            ${deltaHtml}
            <div style="font-size:9px;color:var(--gray-500);">基:${base}</div>
            <div style="font-size:9px;color:var(--gray-500);">实:${actual}</div>
          </div>
        `;
      }).join('');
      rows.push(`
        <tr class="forecast-detail-row" data-parent="${sku.id}">
          <td colspan="18">
            <div style="display:flex; align-items:flex-start; gap:16px; flex-wrap:wrap;">
              <div style="flex-shrink:0;">
                <span style="font-size:11px;color:var(--gray-500);font-weight:600;">📆 未来7天逐日预测（基础 / 活动增量 / 实际）</span>
                ${skuPromoDelta > 0 ? `<span class="promo-delta-badge" style="margin-left:6px;">活动总影响+${skuPromoDelta}</span>` : ''}
              </div>
              <div class="forecast-day-grid" style="flex:1; min-width:560px;">
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
        if (to?.slowMoving) color = getComputedStyle(document.documentElement).getPropertyValue('--red-500').trim() || '#E74C3C';
        else if (to?.rate >= 2) color = getComputedStyle(document.documentElement).getPropertyValue('--green-500').trim() || '#2ECC71';
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
    if ((rep.needsReplenish || AppState.selectedSkus.has(skuId)) && rep.adjustedQty > 0) needCount++;
    if (AppState.selectedSkus.has(skuId)) {
      buyAmount += (rep.purchaseAmount || 0);
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