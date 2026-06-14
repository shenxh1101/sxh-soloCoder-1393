function exportPurchaseOrder(selectedSkus, replenishment, futureDates, fileName = null) {
  if (typeof XLSX === 'undefined') {
    alert('Excel导出库正在加载，请稍候再试...');
    return;
  }
  const exportData = [];
  let totalAmount = 0;
  let totalQty = 0;
  selectedSkus.forEach(skuId => {
    const sku = getSkuById(skuId);
    const rep = replenishment[skuId];
    if (!rep || rep.adjustedQty <= 0) return;
    const row = {
      'SKU编号': sku.id,
      '商品名称': sku.name,
      '商品分类': sku.category,
      '规格(每箱)': rep.caseSize,
      '订货箱数': rep.cases,
      '订货数量': rep.adjustedQty,
      '单价(元)': sku.unitPrice,
      '金额(元)': Math.round(rep.adjustedQty * sku.unitPrice * 100) / 100,
      '当前库存': rep.currentStock,
      '安全库存': rep.safetyStock,
      '7天预测销量': rep.totalForecast
    };
    for (let i = 0; i < 7; i++) {
      row[`D${i + 1}预测(${futureDates[i].slice(5)})`] = rep.forecast7Days[i] || 0;
    }
    exportData.push(row);
    totalAmount += rep.adjustedQty * sku.unitPrice;
    totalQty += rep.adjustedQty;
  });
  if (exportData.length === 0) {
    alert('请先勾选需要采购的商品！');
    return;
  }
  exportData.push({
    'SKU编号': '',
    '商品名称': '合计',
    '商品分类': '',
    '规格(每箱)': '',
    '订货箱数': exportData.reduce((a, b) => a + (b['订货箱数'] || 0), 0),
    '订货数量': totalQty,
    '单价(元)': '',
    '金额(元)': Math.round(totalAmount * 100) / 100,
    '当前库存': '',
    '安全库存': '',
    '7天预测销量': ''
  });
  const ws = XLSX.utils.json_to_sheet(exportData);
  ws['!cols'] = [
    { wch: 10 }, { wch: 22 }, { wch: 10 }, { wch: 11 },
    { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 },
    { wch: 10 }, { wch: 10 }, { wch: 12 },
    { wch: 13 }, { wch: 13 }, { wch: 13 }, { wch: 13 },
    { wch: 13 }, { wch: 13 }, { wch: 13 }
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '采购单');
  const today = new Date().toISOString().split('T')[0];
  const finalFileName = fileName || `采购单_${today}.xlsx`;
  XLSX.writeFile(wb, finalFileName);
}

function drawSparkline(canvas, data, color = '#3498DB') {
  if (!canvas || !data || data.length === 0) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const maxVal = Math.max(...data, 1);
  const minVal = Math.min(...data, 0);
  const range = maxVal - minVal || 1;
  const padding = 2;
  const stepX = (w - padding * 2) / (data.length - 1);
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  data.forEach((val, i) => {
    const x = padding + i * stepX;
    const y = h - padding - ((val - minVal) / range) * (h - padding * 2);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.beginPath();
  ctx.fillStyle = color + '33';
  data.forEach((val, i) => {
    const x = padding + i * stepX;
    const y = h - padding - ((val - minVal) / range) * (h - padding * 2);
    if (i === 0) {
      ctx.moveTo(x, h - padding);
      ctx.lineTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.lineTo(padding + (data.length - 1) * stepX, h - padding);
  ctx.closePath();
  ctx.fill();
}
