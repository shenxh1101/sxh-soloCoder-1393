function calculateDailyAvgSales(history) {
  const total = history.reduce((a, b) => a + b, 0);
  return total / history.length;
}

function calculateSafetyStock(sku, history, globalSafetyDays) {
  const days = sku.safetyStockDays || globalSafetyDays || 3;
  const dailyAvg = calculateDailyAvgSales(history);
  return Math.round(dailyAvg * days);
}

function roundUpToCase(quantity, caseSize) {
  if (quantity <= 0) return { qty: 0, cases: 0 };
  const cs = Math.max(1, caseSize || 1);
  const cases = Math.ceil(quantity / cs);
  return { qty: cases * cs, cases };
}

function calculateSuggestedReplenishment(sku, history, forecast7Days, globalSafetyDays, globalCaseSize) {
  const totalForecast = forecast7Days.reduce((a, b) => a + b, 0);
  const safetyStock = calculateSafetyStock(sku, history, globalSafetyDays);
  const caseSize = sku.caseSize || globalCaseSize || 12;
  const needed = totalForecast + safetyStock;
  const shortage = needed - sku.currentStock;
  let suggestedQty = 0;
  if (shortage > 0) {
    const rounded = roundUpToCase(shortage, caseSize);
    suggestedQty = rounded.qty;
  }
  return {
    skuId: sku.id,
    forecast7Days: [...forecast7Days],
    totalForecast,
    safetyStock,
    currentStock: sku.currentStock,
    caseSize,
    shortage: Math.max(0, shortage),
    suggestedQty,
    adjustedQty: suggestedQty,
    cases: suggestedQty > 0 ? suggestedQty / caseSize : 0,
    needsReplenish: suggestedQty > 0
  };
}

function calculateAllReplenishment(forecastResults, params) {
  const results = {};
  SKU_DATA.forEach(sku => {
    const sales = getSalesBySku(sku.id);
    const forecast = forecastResults[sku.id] || [];
    results[sku.id] = calculateSuggestedReplenishment(
      sku,
      sales.history,
      forecast,
      params.globalSafetyDays,
      params.globalCaseSize
    );
  });
  return results;
}

function recalculateReplenishment(sku, currentReplenishment, newAdjustedQty) {
  const caseSize = currentReplenishment.caseSize;
  const rounded = roundUpToCase(Math.max(0, newAdjustedQty), caseSize);
  return {
    ...currentReplenishment,
    adjustedQty: rounded.qty,
    cases: rounded.cases
  };
}
