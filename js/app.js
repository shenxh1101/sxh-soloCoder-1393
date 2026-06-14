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
  accuracyResults: {},
  turnoverResults: {},
  replenishmentResults: {},
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

function $(sel, root = document) {
  return root.querySelector(sel);
}

function $all(sel, root = document) {
  return Array.from(root.querySelectorAll(sel));
}

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
  CATEGORIES.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    sel.appendChild(opt);
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
  sel.addEventListener('change', updatePromoElasticityHint);
  updatePromoElasticityHint();
}

function updatePromoElasticityHint() {
  const skuId = $('#promoSkuSelect').value;
  const sku = getSkuById(skuId);
  const discount = parseFloat($('#promoDiscount').value);
  const suggested = 1 + (1 - discount) * sku.promotionElasticity;
  $('#promoElasticityHint').textContent =
    `💡 建议系数：${suggested.toFixed(2)}x 基于弹性系数 ${sku.promotionElasticity} (${sku.category})`;
}

function setDefaultPromoDate() {
  const dates = getFutureDates();
  $('#promoDate').value = dates[2] || dates[0];
  $('#promoDate').min = dates[0];
  $('#promoDate').max = dates[dates.length - 1];
}

function bindEvents() {
  $('#runForecastBtn').addEventListener('click', runFullForecast);
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
  });
  $('#caseSizeInput').addEventListener('change', (e) => {
    AppState.params.globalCaseSize = parseInt(e.target.value) || 12;
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
  $('#promoDiscount').addEventListener('change', () => {
    const discount = parseFloat($('#promoDiscount').value);
    const skuId = $('#promoSkuSelect').value;
    const sku = getSkuById(skuId);
    const suggested = 1 + (1 - discount) * sku.promotionElasticity;
    $('#promoImpact').value = Math.min(3, Math.max(1, suggested));
    $('#promoImpactValue').textContent = parseFloat($('#promoImpact').value).toFixed(1) + 'x';
    updatePromoElasticityHint();
  });
  $('#promoImpact').addEventListener('input', (e) => {
    $('#promoImpactValue').textContent = parseFloat(e.target.value).toFixed(1) + 'x';
  });
  $('#exportBtn').addEventListener('click', () => {
    if (AppState.selectedSkus.size === 0) {
      alert('请先在表格中勾选需要导出采购单的商品！');
      return;
    }
    if (Object.keys(AppState.replenishmentResults).length === 0) {
      alert('请先点击「运行预测与补货计算」生成补货建议！');
      return;
    }
    exportPurchaseOrder(
      Array.from(AppState.selectedSkus),
      AppState.replenishmentResults,
      AppState.futureDates
    );
  });
  toggleAlphaGroup();
}

function toggleAlphaGroup() {
  const group = $('#alphaGroup');
  group.style.display = AppState.params.method === 'exponentialSmoothing' ? 'block' : 'none';
}

function runFullForecast() {
  const btn = $('#runForecastBtn');
  btn.disabled = true;
  btn.textContent = '⏳ 正在计算...';
  setTimeout(() => {
    AppState.forecastResults = runForecastForAll(
      AppState.params,
      AppState.promotions,
      AppState.futureDates
    );
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
    btn.textContent = '🚀 运行预测与补货计算';
  }, 300);
}

function openPromoModal() {
  $('#promoModal').classList.add('active');
}

function closePromoModal() {
  $('#promoModal').classList.remove('active');
}

function addPromotion() {
  const skuId = $('#promoSkuSelect').value;
  const date = $('#promoDate').value;
  const discount = parseFloat($('#promoDiscount').value);
  const impactFactor = parseFloat($('#promoImpact').value);
  if (!date) {
    alert('请选择促销日期！');
    return;
  }
  const exists = AppState.promotions.find(p => p.skuId === skuId && p.date === date);
  if (exists) {
    exists.discount = discount;
    exists.impactFactor = impactFactor;
  } else {
    AppState.promotions.push({
      id: 'PROMO' + Date.now(),
      skuId, date, discount, impactFactor
    });
  }
  AppState.promotions.sort((a, b) => a.date.localeCompare(b.date));
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
    const sku = getSkuById(p.skuId);
    const dateLabel = p.date.slice(5).replace('-', '/');
    const discountLabel = Math.round(p.discount * 10) + '折';
    return `
      <div class="promo-item">
        <div class="promo-header">
          <span class="promo-sku">${CATEGORY_EMOJI[sku.category] || '📦'} ${sku.name}</span>
          <button class="promo-close" onclick="removePromotion('${p.id}')">×</button>
        </div>
        <div class="promo-details">
          <span class="promo-detail">📅 <strong>${dateLabel}</strong></span>
          <span class="promo-detail">🏷️ <strong>${discountLabel}</strong></span>
          <span class="promo-detail">📈 <strong>${p.impactFactor.toFixed(1)}x</strong></span>
        </div>
      </div>
    `;
  }).join('');
}

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
  const rows = [];
  filteredSkus.forEach((sku, idx) => {
    const sales = getSalesBySku(sku.id);
    const turnover = AppState.turnoverResults[sku.id];
    const forecast = AppState.forecastResults[sku.id];
    const accuracy = AppState.accuracyResults[sku.id];
    const replen = AppState.replenishmentResults[sku.id];
    const hasForecast = !!forecast;
    if (hasForecast && replen && replen.currentStock < replen.safetyStock) {
      alertCount++;
    }
    const avgDaily = Math.round(turnover.monthlySales / 30);
    const turnoverBadge = getTurnoverBadge(turnover.rate);
    const accuracyBadge = hasForecast ? getAccuracyBadge(accuracy) : '<span class="badge badge-warning">待预测</span>';
    const stockBadge = replen ? getStockBadge(replen.currentStock, replen.safetyStock) : '';
    const sparkId = `spark_${sku.id}`;
    const skuPromoDates = AppState.promotions
      .filter(p => p.skuId === sku.id)
      .map(p => p.date);
    const isExpanded = AppState.expandedRows.has(sku.id);
    const slowClass = turnover.slowMoving ? 'slow-moving' : '';
    const animClass = animate ? 'updated' : '';
    const animDelay = animate ? `style="animation-delay: ${idx * 0.05}s"` : '';
    const checkboxChecked = AppState.selectedSkus.has(sku.id) ? 'checked' : '';
    const categoryEmoji = CATEGORY_EMOJI[sku.category] || '📦';
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
        <td>
          <canvas id="${sparkId}" class="sparkline-canvas" width="100" height="28"></canvas>
        </td>
        <td class="num-col num-mono">${formatNumber(turnover.monthlySales)}<br><span style="font-size:10px;color:var(--gray-500)">日均${avgDaily}</span></td>
        <td class="num-col">${turnoverBadge}</td>
        <td class="num-col">
          ${hasForecast
            ? `<span class="num-mono num-orange num-large" onclick="toggleExpand('${sku.id}')" style="cursor:pointer;">${formatNumber(replen.totalForecast)}</span>
               <div class="forecast-detail-toggle" onclick="toggleExpand('${sku.id}')">${isExpanded ? '▲ 收起' : '▼ 展开'}</div>`
            : '<span class="badge badge-warning">待预测</span>'
          }
        </td>
        <td class="num-col num-mono">${hasForecast ? formatNumber(replen.safetyStock) : '—'}</td>
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
        const hasPromo = skuPromoDates.includes(d) ? 'has-promo' : '';
        const actual = sales.actualFuture[i];
        return `
          <div class="forecast-day ${hasPromo}">
            <div class="forecast-day-label">${d.slice(5).replace('-', '/')}${skuPromoDates.includes(d) ? ' 🎯' : ''}</div>
            <div class="forecast-day-val">${forecast[i]}</div>
            <div style="font-size:9px;color:var(--gray-500);">实:${actual}</div>
          </div>
        `;
      }).join('');
      rows.push(`
        <tr class="forecast-detail-row" data-parent="${sku.id}">
          <td colspan="14">
            <div style="display:flex; align-items:center; gap:16px; flex-wrap:wrap;">
              <div style="flex-shrink:0;">
                <span style="font-size:11px;color:var(--gray-500);font-weight:600;">📆 未来7天逐日预测：</span>
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
        const color = AppState.turnoverResults[sku.id]?.slowMoving
          ? 'var(--red-500)'
          : AppState.turnoverResults[sku.id]?.rate >= 2 ? 'var(--green-500)' : 'var(--blue-500)';
        drawSparkline(canvas, sales.history, color.startsWith('var') ? getVarValue(color) : color);
      }
    });
  }, 0);
  bindTableEvents();
  $('#alertCount').textContent = alertCount;
  updateAvgAccuracy();
}

function bindTableEvents() {
  $all('.row-check').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const skuId = e.target.dataset.sku;
      if (e.target.checked) AppState.selectedSkus.add(skuId);
      else AppState.selectedSkus.delete(skuId);
      updateKpiBuyAmount();
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

function getVarValue(varName) {
  varName = varName.replace('var(', '').replace(')', '').trim();
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}

function toggleExpand(skuId) {
  if (AppState.expandedRows.has(skuId)) {
    AppState.expandedRows.delete(skuId);
  } else {
    AppState.expandedRows.add(skuId);
  }
  renderTable();
}

function getTurnoverBadge(rate) {
  if (rate < 1.0) {
    return `<span class="badge badge-danger">${rate.toFixed(2)} ⚠️</span>`;
  } else if (rate < 2.0) {
    return `<span class="badge badge-warning">${rate.toFixed(2)}</span>`;
  }
  return `<span class="badge badge-success">${rate.toFixed(2)}</span>`;
}

function getAccuracyBadge(acc) {
  if (acc >= 80) {
    return `<span class="badge badge-success">${acc.toFixed(1)}%</span>`;
  } else if (acc >= 60) {
    return `<span class="badge badge-warning">${acc.toFixed(1)}%</span>`;
  }
  return `<span class="badge badge-danger">${acc.toFixed(1)}%</span>`;
}

function getStockBadge(current, safety) {
  if (current < safety) return '<span style="font-size:10px; margin-left:4px;" class="badge badge-danger">⚠️低</span>';
  if (current < safety * 1.5) return '<span style="font-size:10px; margin-left:4px;" class="badge badge-warning">偏低</span>';
  return '';
}

function updateAvgAccuracy() {
  const vals = Object.values(AppState.accuracyResults);
  if (vals.length === 0) {
    $('#avgAccuracy').textContent = '—';
    return;
  }
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  $('#avgAccuracy').textContent = avg.toFixed(1) + '%';
  $('#avgAccuracy').className =
    avg >= 80 ? 'badge badge-success' :
    avg >= 60 ? 'badge badge-warning' : 'badge badge-danger';
}

function renderKpiBaseline() {
  let totalStockValue = 0;
  let totalMonthSales = 0;
  let slowCount = 0;
  let totalTurnoverWeighted = 0;
  let totalMonthlyWeight = 0;
  SKU_DATA.forEach(sku => {
    const sales = getSalesBySku(sku.id);
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
}

function renderKpiAfterForecast() {
  renderKpiBaseline();
  updateKpiBuyAmount();
}

function updateKpiBuyAmount() {
  let needCount = 0;
  let buyAmount = 0;
  Object.keys(AppState.replenishmentResults).forEach(skuId => {
    const rep = AppState.replenishmentResults[skuId];
    const sku = getSkuById(skuId);
    if (rep.needsReplenish || AppState.selectedSkus.has(skuId)) {
      if (rep.adjustedQty > 0) needCount++;
    }
    if (AppState.selectedSkus.has(skuId)) {
      buyAmount += rep.adjustedQty * sku.unitPrice;
    }
  });
  $('#kpiNeedBuy').textContent = needCount;
  $('#kpiBuyAmount').textContent = '¥' + formatLargeNumber(buyAmount);
}

function formatLargeNumber(n) {
  if (n >= 10000) {
    return (n / 10000).toFixed(2) + '万';
  }
  return Math.round(n).toLocaleString('zh-CN');
}

document.addEventListener('DOMContentLoaded', initApp);
