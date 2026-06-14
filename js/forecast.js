function movingAverage(history, windowSize, days = 7) {
  const result = [];
  const data = [...history];
  for (let i = 0; i < days; i++) {
    const start = Math.max(0, data.length - windowSize);
    const window = data.slice(start);
    const avg = window.reduce((a, b) => a + b, 0) / window.length;
    const val = Math.round(avg);
    result.push(val);
    data.push(val);
  }
  return result;
}

function exponentialSmoothing(history, alpha = 0.3, days = 7) {
  const result = [];
  let level = history[0];
  for (let i = 1; i < history.length; i++) {
    level = alpha * history[i] + (1 - alpha) * level;
  }
  for (let i = 0; i < days; i++) {
    const val = Math.round(level);
    result.push(val);
    level = alpha * val + (1 - alpha) * level;
  }
  return result;
}

function runForecast(history, params) {
  const { method, windowSize, alpha } = params;
  if (method === "exponentialSmoothing") {
    return exponentialSmoothing(history, alpha, 7);
  }
  return movingAverage(history, windowSize, 7);
}

function expandPromoDateRange(promo) {
  const dates = [];
  if (promo.dates && promo.dates.length > 0) {
    return promo.dates;
  }
  const start = new Date(promo.startDate || promo.date);
  const endDate = promo.endDate || promo.startDate || promo.date;
  const end = new Date(endDate);
  const cur = new Date(start);
  while (cur <= end) {
    dates.push(cur.toISOString().split('T')[0]);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function getPromoAffectedSkus(promo) {
  if (promo.scope === 'category') {
    return SKU_DATA.filter(s => s.category === promo.category).map(s => s.id);
  }
  if (promo.scope === 'multi' && promo.skuIds && promo.skuIds.length > 0) {
    return promo.skuIds;
  }
  return [promo.skuId];
}

function applyPromotions(forecast, skuId, promotions, futureDates) {
  const sku = getSkuById(skuId);
  const adjusted = [...forecast];
  const promoImpact = new Array(7).fill(null);
  promotions.forEach(promo => {
    const affectedSkus = getPromoAffectedSkus(promo);
    if (!affectedSkus.includes(skuId)) return;
    const promoDates = expandPromoDateRange(promo);
    const baseMultiplier = 1 + (1 - promo.discount) * sku.promotionElasticity;
    const multiplier = promo.impactFactor || baseMultiplier;
    promoDates.forEach(dateStr => {
      const dateIdx = futureDates.indexOf(dateStr);
      if (dateIdx >= 0 && dateIdx < 7) {
        const original = forecast[dateIdx];
        const boosted = Math.round(original * multiplier);
        adjusted[dateIdx] = Math.max(adjusted[dateIdx], boosted);
        promoImpact[dateIdx] = {
          promoId: promo.id,
          promoName: promo.name || `${Math.round(promo.discount * 10)}折`,
          discount: promo.discount,
          multiplier,
          original,
          boosted: adjusted[dateIdx],
          delta: adjusted[dateIdx] - original
        };
      }
    });
  });
  return { adjusted, promoImpact };
}

function runForecastForAll(params, promotions, futureDates) {
  const results = {};
  const promoImpacts = {};
  SKU_DATA.forEach(sku => {
    const sales = getSalesBySku(sku.id);
    const baseForecast = runForecast(sales.history, params);
    const { adjusted, promoImpact } = applyPromotions(baseForecast, sku.id, promotions, futureDates);
    results[sku.id] = adjusted;
    promoImpacts[sku.id] = promoImpact;
  });
  return { forecast: results, promoImpacts };
}

function runForecastForAllLegacy(params, promotions, futureDates) {
  const { forecast } = runForecastForAll(params, promotions, futureDates);
  return forecast;
}
