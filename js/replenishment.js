function calculateDailyAvgSales(history) {
  const total = history.reduce((a, b) => a + b, 0);
  return total / history.length;
}

function calculateSafetyStock(sku, history, globalSafetyDays) {
  const days = sku.safetyStockDays || globalSafetyDays || 3;
  const dailyAvg = calculateDailyAvgSales(history);
  const source = sku.safetyStockDays ? 'sku' : 'global';
  return {
    value: Math.round(dailyAvg * days),
    days,
    source
  };
}

function resolveCaseSize(sku, globalCaseSize) {
  const caseSize = sku.caseSize || globalCaseSize || 12;
  const source = sku.caseSize ? 'sku' : 'global';
  return { value: caseSize, source };
}

function roundUpToCase(quantity, caseSize) {
  if (quantity <= 0) return { qty: 0, cases: 0 };
  const cs = Math.max(1, caseSize || 1);
  const cases = Math.ceil(quantity / cs);
  return { qty: cases * cs, cases };
}

function calculateCoverageDays(currentStock, orderQty, dailyAvgSales) {
  const total = currentStock + orderQty;
  const avg = dailyAvgSales > 0 ? dailyAvgSales : 1;
  return Math.round((total / avg) * 10) / 10;
}

function calculateSuggestedReplenishment(sku, history, forecast7Days, globalSafetyDays, globalCaseSize) {
  const totalForecast = forecast7Days.reduce((a, b) => a + b, 0);
  const safetyStockInfo = calculateSafetyStock(sku, history, globalSafetyDays);
  const caseSizeInfo = resolveCaseSize(sku, globalCaseSize);
  const safetyStock = safetyStockInfo.value;
  const caseSize = caseSizeInfo.value;
  const needed = totalForecast + safetyStock;
  const shortage = needed - sku.currentStock;
  let suggestedQty = 0;
  if (shortage > 0) {
    const rounded = roundUpToCase(shortage, caseSize);
    suggestedQty = rounded.qty;
  }
  const dailyAvg = calculateDailyAvgSales(history);
  const coverageAfterOrder = calculateCoverageDays(sku.currentStock, suggestedQty, dailyAvg);
  return {
    skuId: sku.id,
    forecast7Days: [...forecast7Days],
    totalForecast,
    safetyStock,
    safetyStockDays: safetyStockInfo.days,
    safetyStockSource: safetyStockInfo.source,
    currentStock: sku.currentStock,
    caseSize,
    caseSizeSource: caseSizeInfo.source,
    shortage: Math.max(0, shortage),
    suggestedQty,
    adjustedQty: suggestedQty,
    cases: suggestedQty > 0 ? suggestedQty / caseSize : 0,
    needsReplenish: suggestedQty > 0,
    dailyAvgSales: dailyAvg,
    coverageDaysAfterOrder: coverageAfterOrder
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
  const coverageAfterOrder = calculateCoverageDays(
    sku.currentStock,
    rounded.qty,
    currentReplenishment.dailyAvgSales
  );
  return {
    ...currentReplenishment,
    adjustedQty: rounded.qty,
    cases: rounded.cases,
    coverageDaysAfterOrder
  };
}

function compareTwoPlans(params, promotions, futureDates) {
  const maParams = { ...params, method: 'movingAverage' };
  const esParams = { ...params, method: 'exponentialSmoothing' };
  const maResult = runForecastForAll(maParams, promotions, futureDates);
  const esResult = runForecastForAll(esParams, promotions, futureDates);
  const maForecast = maResult.forecast;
  const esForecast = esResult.forecast;
  const maAccuracy = calculateAccuracyForAll(maForecast);
  const esAccuracy = calculateAccuracyForAll(esForecast);
  const maReplen = calculateAllReplenishment(maForecast, params);
  const esReplen = calculateAllReplenishment(esForecast, params);
  return {
    movingAverage: { forecast: maForecast, accuracy: maAccuracy, replenishment: maReplen, promoImpacts: maResult.promoImpacts },
    exponentialSmoothing: { forecast: esForecast, accuracy: esAccuracy, replenishment: esReplen, promoImpacts: esResult.promoImpacts }
  };
}
