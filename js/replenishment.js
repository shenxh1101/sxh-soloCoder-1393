function calculateDailyAvgSales(history) {
  const total = history.reduce((a, b) => a + b, 0);
  return total / history.length;
}

function calculateSafetyStock(sku, history, globalSafetyDays, skuOverride = {}) {
  const useOverride = skuOverride.enabled;
  const days = useOverride && skuOverride.safetyStockDays != null
    ? skuOverride.safetyStockDays
    : (sku.safetyStockDays || globalSafetyDays || 3);
  const dailyAvg = calculateDailyAvgSales(history);
  let source;
  if (useOverride && skuOverride.safetyStockDays != null) source = 'override';
  else if (sku.safetyStockDays) source = 'sku';
  else source = 'global';
  return {
    value: Math.round(dailyAvg * days),
    days,
    source
  };
}

function resolveCaseSize(sku, globalCaseSize, skuOverride = {}) {
  const useOverride = skuOverride.enabled;
  const caseSize = useOverride && skuOverride.caseSize != null
    ? skuOverride.caseSize
    : (sku.caseSize || globalCaseSize || 12);
  let source;
  if (useOverride && skuOverride.caseSize != null) source = 'override';
  else if (sku.caseSize) source = 'sku';
  else source = 'global';
  return { value: caseSize, source };
}

function roundUpToCase(quantity, caseSize, minOrderCases = 0) {
  if (quantity <= 0) return { qty: 0, cases: 0 };
  const cs = Math.max(1, caseSize || 1);
  let cases = Math.ceil(quantity / cs);
  if (minOrderCases > 0 && cases > 0 && cases < minOrderCases) {
    cases = minOrderCases;
  }
  return { qty: cases * cs, cases };
}

function calculateCoverageDays(currentStock, orderQty, dailyAvgSales) {
  const total = currentStock + orderQty;
  const avg = dailyAvgSales > 0 ? dailyAvgSales : 1;
  return Math.round((total / avg) * 10) / 10;
}

function calculateStockoutRisk(sku, history, forecast7Days, leadTimeDays) {
  const dailyAvg = calculateDailyAvgSales(history);
  const leadTime = leadTimeDays || sku.leadTimeDays || 2;
  const leadTimeDemand = dailyAvg * leadTime;
  const firstNDaysDemand = forecast7Days.slice(0, Math.min(leadTime, 7)).reduce((a, b) => a + b, 0);
  const effectiveDemand = Math.max(leadTimeDemand, firstNDaysDemand);
  const gap = sku.currentStock - effectiveDemand;
  if (gap <= 0) {
    const severity = Math.min(100, Math.round(Math.abs(gap) / Math.max(1, effectiveDemand) * 100));
    return {
      risk: 'high',
      score: severity,
      label: '高风险',
      shortfallQty: Math.abs(gap),
      leadTimeDays: leadTime
    };
  }
  const ratio = sku.currentStock / effectiveDemand;
  if (ratio < 0.7) {
    return {
      risk: 'medium',
      score: Math.round((1 - ratio) * 100),
      label: '中风险',
      shortfallQty: 0,
      leadTimeDays: leadTime
    };
  }
  return {
    risk: 'low',
    score: Math.round((1 - ratio) * 100),
    label: '低风险',
    shortfallQty: 0,
    leadTimeDays: leadTime
  };
}

function calculateGrossProfit(sku, forecast7Days, orderQty = 0) {
  const unitMargin = (sku.unitPrice || 0) - (sku.costPrice || 0);
  const forecastTotal = forecast7Days.reduce((a, b) => a + b, 0);
  const forecastProfit = Math.round(forecastTotal * unitMargin * 100) / 100;
  const orderCost = Math.round(orderQty * (sku.costPrice || 0) * 100) / 100;
  const orderRevenue = Math.round(orderQty * (sku.unitPrice || 0) * 100) / 100;
  const orderProfit = Math.round((orderRevenue - orderCost) * 100) / 100;
  const marginRate = sku.unitPrice > 0 ? Math.round(unitMargin / sku.unitPrice * 1000) / 10 : 0;
  return {
    unitMargin: Math.round(unitMargin * 100) / 100,
    marginRate,
    forecastProfit,
    orderCost,
    orderRevenue,
    orderProfit
  };
}

function calculateEstimatedArrivalDate(sku, baseDate) {
  const supplier = getSupplierBySkuId(sku.id);
  const leadTime = supplier?.leadTimeDays || sku.leadTimeDays || 2;
  const today = baseDate || new Date().toISOString().split('T')[0];
  return addDays(today, leadTime);
}

function calculateSuggestedReplenishment(sku, history, forecast7Days, baseForecast7Days, globalSafetyDays, globalCaseSize, skuOverride = {}) {
  const totalForecast = forecast7Days.reduce((a, b) => a + b, 0);
  const baseTotalForecast = baseForecast7Days ? baseForecast7Days.reduce((a, b) => a + b, 0) : totalForecast;
  const promoDeltaQty = totalForecast - baseTotalForecast;
  const safetyStockInfo = calculateSafetyStock(sku, history, globalSafetyDays, skuOverride);
  const caseSizeInfo = resolveCaseSize(sku, globalCaseSize, skuOverride);
  const safetyStock = safetyStockInfo.value;
  const caseSize = caseSizeInfo.value;
  const needed = totalForecast + safetyStock;
  const shortage = needed - sku.currentStock;
  let suggestedQty = 0;
  if (shortage > 0) {
    const rounded = roundUpToCase(shortage, caseSize, sku.minOrderCases || 0);
    suggestedQty = rounded.qty;
  }
  const baseNeeded = baseTotalForecast + safetyStock;
  const baseShortage = baseNeeded - sku.currentStock;
  let baseSuggestedQty = 0;
  if (baseShortage > 0) {
    const rounded = roundUpToCase(baseShortage, caseSize, sku.minOrderCases || 0);
    baseSuggestedQty = rounded.qty;
  }
  const promoExtraQty = Math.max(0, suggestedQty - baseSuggestedQty);
  const dailyAvg = calculateDailyAvgSales(history);
  const coverageAfterOrder = calculateCoverageDays(sku.currentStock, suggestedQty, dailyAvg);
  const stockoutRisk = calculateStockoutRisk(sku, history, forecast7Days);
  const grossProfit = calculateGrossProfit(sku, forecast7Days, suggestedQty);
  const arrivalDate = calculateEstimatedArrivalDate(sku);
  const supplier = getSupplierBySkuId(sku.id);
  const purchaseAmount = Math.round(suggestedQty * sku.unitPrice * 100) / 100;
  return {
    skuId: sku.id,
    forecast7Days: [...forecast7Days],
    baseForecast7Days: baseForecast7Days ? [...baseForecast7Days] : [...forecast7Days],
    totalForecast,
    baseTotalForecast,
    promoDeltaQty,
    safetyStock,
    safetyStockDays: safetyStockInfo.days,
    safetyStockSource: safetyStockInfo.source,
    currentStock: sku.currentStock,
    caseSize,
    caseSizeSource: caseSizeInfo.source,
    shortage: Math.max(0, shortage),
    suggestedQty,
    baseSuggestedQty,
    promoExtraQty,
    adjustedQty: suggestedQty,
    cases: suggestedQty > 0 ? suggestedQty / caseSize : 0,
    needsReplenish: suggestedQty > 0,
    dailyAvgSales: dailyAvg,
    coverageDaysAfterOrder: coverageAfterOrder,
    stockoutRisk,
    grossProfit,
    arrivalDate,
    supplierId: sku.supplierId,
    supplierName: supplier?.name || '—',
    minOrderCases: sku.minOrderCases || 0,
    purchaseAmount
  };
}

function calculateAllReplenishment(forecastResults, baseForecastResults, params, skuOverrides = {}) {
  const results = {};
  SKU_DATA.forEach(sku => {
    const sales = getSalesBySku(sku.id);
    const forecast = forecastResults[sku.id] || [];
    const baseForecast = baseForecastResults ? baseForecastResults[sku.id] : null;
    const override = skuOverrides[sku.id] || { enabled: false };
    results[sku.id] = calculateSuggestedReplenishment(
      sku,
      sales.history,
      forecast,
      baseForecast,
      params.globalSafetyDays,
      params.globalCaseSize,
      override
    );
  });
  return results;
}

function recalculateReplenishment(sku, currentReplenishment, newAdjustedQty) {
  const caseSize = currentReplenishment.caseSize;
  const rounded = roundUpToCase(Math.max(0, newAdjustedQty), caseSize, sku.minOrderCases || 0);
  const coverageAfterOrder = calculateCoverageDays(
    sku.currentStock,
    rounded.qty,
    currentReplenishment.dailyAvgSales
  );
  const grossProfit = calculateGrossProfit(sku, currentReplenishment.forecast7Days, rounded.qty);
  const baseQty = currentReplenishment.baseSuggestedQty;
  const promoExtraQty = Math.max(0, rounded.qty - baseQty);
  const purchaseAmount = Math.round(rounded.qty * sku.unitPrice * 100) / 100;
  return {
    ...currentReplenishment,
    adjustedQty: rounded.qty,
    cases: rounded.cases,
    coverageDaysAfterOrder,
    grossProfit,
    promoExtraQty,
    purchaseAmount
  };
}

function groupBySupplier(replenishmentResults, selectedSkuIds) {
  const grouped = {};
  (selectedSkuIds || Object.keys(replenishmentResults)).forEach(skuId => {
    const rep = replenishmentResults[skuId];
    if (!rep || rep.adjustedQty <= 0) return;
    const sku = getSkuById(skuId);
    const sup = getSupplierBySkuId(skuId);
    const supId = sku.supplierId;
    if (!grouped[supId]) {
      grouped[supId] = {
        supplierId: supId,
        supplierName: sup?.name || '未知供应商',
        contact: sup?.contact || '—',
        phone: sup?.phone || '—',
        leadTimeDays: sup?.leadTimeDays || sku.leadTimeDays || 2,
        minOrderAmount: sup?.minOrderAmount || 0,
        arrivalDate: calculateEstimatedArrivalDate(sku),
        items: [],
        totalQty: 0,
        totalCases: 0,
        totalAmount: 0,
        totalCost: 0,
        totalProfit: 0,
        promoExtraQty: 0
      };
    }
    grouped[supId].items.push({
      skuId,
      skuName: sku.name,
      category: sku.category,
      unitPrice: sku.unitPrice,
      costPrice: sku.costPrice,
      caseSize: rep.caseSize,
      cases: rep.adjustedQty / rep.caseSize,
      orderQty: rep.adjustedQty,
      baseQty: rep.baseSuggestedQty,
      promoExtraQty: rep.promoExtraQty,
      amount: rep.purchaseAmount,
      cost: Math.round(rep.adjustedQty * (sku.costPrice || 0) * 100) / 100
    });
    grouped[supId].totalQty += rep.adjustedQty;
    grouped[supId].totalCases += rep.adjustedQty / rep.caseSize;
    grouped[supId].totalAmount += rep.purchaseAmount;
    grouped[supId].totalCost += Math.round(rep.adjustedQty * (sku.costPrice || 0) * 100) / 100;
    grouped[supId].totalProfit += rep.grossProfit.orderProfit;
    grouped[supId].promoExtraQty += rep.promoExtraQty;
  });
  Object.values(grouped).forEach(g => {
    g.totalAmount = Math.round(g.totalAmount * 100) / 100;
    g.totalCost = Math.round(g.totalCost * 100) / 100;
    g.totalProfit = Math.round(g.totalProfit * 100) / 100;
    g.meetsMinOrder = g.totalAmount >= g.minOrderAmount;
  });
  return grouped;
}

function buildScenarioPlan(name, params, forecastResults, baseForecastResults, promoImpacts, accuracyResults, replenishmentResults) {
  let totalForecast = 0, totalAccuracy = 0, totalReplenQty = 0, totalAmount = 0;
  let totalProfit = 0, highRiskCount = 0, totalCoverage = 0, totalPromoDelta = 0, count = 0;
  let needBuyCount = 0;
  Object.keys(replenishmentResults).forEach(skuId => {
    const r = replenishmentResults[skuId];
    if (!r) return;
    const sku = getSkuById(skuId);
    totalForecast += r.totalForecast || 0;
    totalReplenQty += r.adjustedQty || 0;
    totalAmount += r.purchaseAmount || 0;
    totalProfit += (r.grossProfit && r.grossProfit.forecastProfit) || 0;
    totalCoverage += r.coverageDaysAfterOrder || 0;
    totalPromoDelta += r.promoDeltaQty || 0;
    if (r.stockoutRisk && r.stockoutRisk.risk === 'high') highRiskCount++;
    if ((r.adjustedQty || 0) > 0) needBuyCount++;
    if (accuracyResults[skuId] != null) {
      totalAccuracy += accuracyResults[skuId];
      count++;
    }
  });
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const savedAt = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  return {
    name,
    savedAt,
    params: JSON.parse(JSON.stringify(params)),
    forecastResults: JSON.parse(JSON.stringify(forecastResults)),
    baseForecastResults: baseForecastResults ? JSON.parse(JSON.stringify(baseForecastResults)) : null,
    promoImpacts: JSON.parse(JSON.stringify(promoImpacts || {})),
    accuracyResults: JSON.parse(JSON.stringify(accuracyResults)),
    replenishmentResults: JSON.parse(JSON.stringify(replenishmentResults)),
    summary: {
      totalForecast7Days: totalForecast,
      avgAccuracy: count > 0 ? Math.round(totalAccuracy / count * 10) / 10 : 0,
      totalSuggestedQty: totalReplenQty,
      totalPurchaseAmount: Math.round(totalAmount * 100) / 100,
      totalGrossProfit: Math.round(totalProfit * 100) / 100,
      highRiskCount,
      avgCoverageDays: Object.keys(replenishmentResults).length > 0
        ? Math.round(totalCoverage / Object.keys(replenishmentResults).length * 10) / 10 : 0,
      totalPromoDelta,
      needBuyCount
    }
  };
}

function compareTwoPlans(params, promotions, futureDates) {
  const maParams = { ...params, method: 'movingAverage' };
  const esParams = { ...params, method: 'exponentialSmoothing' };
  const maResult = runForecastForAll(maParams, promotions, futureDates);
  const esResult = runForecastForAll(esParams, promotions, futureDates);
  const maForecast = maResult.forecast;
  const esForecast = esResult.forecast;
  const maBase = maResult.baseForecast;
  const esBase = esResult.baseForecast;
  const maAccuracy = calculateAccuracyForAll(maForecast);
  const esAccuracy = calculateAccuracyForAll(esForecast);
  const maReplen = calculateAllReplenishment(maForecast, maBase, params);
  const esReplen = calculateAllReplenishment(esForecast, esBase, params);
  return {
    movingAverage: {
      forecast: maForecast,
      baseForecast: maBase,
      accuracy: maAccuracy,
      replenishment: maReplen,
      promoImpacts: maResult.promoImpacts
    },
    exponentialSmoothing: {
      forecast: esForecast,
      baseForecast: esBase,
      accuracy: esAccuracy,
      replenishment: esReplen,
      promoImpacts: esResult.promoImpacts
    }
  };
}
