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

function applyPromotions(forecast, skuId, promotions, futureDates) {
  const sku = getSkuById(skuId);
  const adjusted = [...forecast];
  const relevantPromos = promotions.filter(p => p.skuId === skuId);
  relevantPromos.forEach(promo => {
    const dateIdx = futureDates.indexOf(promo.date);
    if (dateIdx >= 0 && dateIdx < 7) {
      const baseMultiplier = 1 + (1 - promo.discount) * sku.promotionElasticity;
      const multiplier = promo.impactFactor || baseMultiplier;
      adjusted[dateIdx] = Math.round(adjusted[dateIdx] * multiplier);
    }
  });
  return adjusted;
}

function runForecastForAll(params, promotions, futureDates) {
  const results = {};
  SKU_DATA.forEach(sku => {
    const sales = getSalesBySku(sku.id);
    const baseForecast = runForecast(sales.history, params);
    const adjustedForecast = applyPromotions(baseForecast, sku.id, promotions, futureDates);
    results[sku.id] = adjustedForecast;
  });
  return results;
}
