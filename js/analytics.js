function calculateAccuracy(forecast, actual) {
  if (!forecast || !actual || forecast.length === 0 || actual.length === 0) return 0;
  let totalAPE = 0;
  let validCount = 0;
  for (let i = 0; i < Math.min(forecast.length, actual.length); i++) {
    if (actual[i] > 0) {
      totalAPE += Math.abs((actual[i] - forecast[i]) / actual[i]);
      validCount++;
    } else if (forecast[i] === 0) {
      validCount++;
    }
  }
  if (validCount === 0) return 100;
  const mape = totalAPE / validCount;
  const accuracy = (1 - Math.min(mape, 1)) * 100;
  return Math.round(accuracy * 10) / 10;
}

function calculateAccuracyForAll(forecastResults) {
  const results = {};
  SKU_DATA.forEach(sku => {
    const sales = getSalesBySku(sku.id);
    const forecast = forecastResults[sku.id];
    results[sku.id] = calculateAccuracy(forecast, sales.actualFuture);
  });
  return results;
}

function calculateMonthlySales(history) {
  return history.reduce((a, b) => a + b, 0);
}

function calculateTurnoverRate(sku, history) {
  const monthlySales = calculateMonthlySales(history);
  const avgStock = sku.avgStockMonth || 1;
  const rate = monthlySales / avgStock;
  return Math.round(rate * 100) / 100;
}

function isSlowMoving(turnoverRate, threshold = 1.0) {
  return turnoverRate < threshold;
}

function calculateTurnoverForAll() {
  const results = {};
  SKU_DATA.forEach(sku => {
    const sales = getSalesBySku(sku.id);
    const rate = calculateTurnoverRate(sku, sales.history);
    results[sku.id] = {
      rate,
      monthlySales: calculateMonthlySales(sales.history),
      slowMoving: isSlowMoving(rate)
    };
  });
  return results;
}

function formatNumber(n) {
  if (n === null || n === undefined || isNaN(n)) return '0';
  return n.toLocaleString('zh-CN', { maximumFractionDigits: 1 });
}

function formatCurrency(n) {
  if (n === null || n === undefined || isNaN(n)) return '¥0';
  return '¥' + Math.round(n).toLocaleString('zh-CN');
}

function formatPercent(n) {
  if (n === null || n === undefined || isNaN(n)) return '0%';
  return (Math.round(n * 1000) / 10) + '%';
}

function riskLevelClass(risk) {
  if (!risk) return 'risk-low';
  if (risk === 'high') return 'risk-high';
  if (risk === 'medium') return 'risk-medium';
  return 'risk-low';
}

function riskBadge(riskObj) {
  if (!riskObj) return '<span class="badge badge-gray">—</span>';
  const map = {
    high: { cls: 'badge-danger', icon: '🔴' },
    medium: { cls: 'badge-warning', icon: '🟡' },
    low: { cls: 'badge-success', icon: '🟢' }
  };
  const m = map[riskObj.risk] || map.low;
  return `<span class="badge ${m.cls}">${m.icon} ${riskObj.label}</span>`;
}
