function buildMainExportData(selectedSkus, replenishment, futureDates) {
  const exportData = [];
  let totalAmount = 0, totalQty = 0, totalCases = 0, totalBaseQty = 0, totalPromoExtra = 0;
  selectedSkus.forEach(skuId => {
    const sku = getSkuById(skuId);
    const rep = replenishment[skuId];
    if (!rep || rep.adjustedQty <= 0) return;
    const supplier = getSupplierBySkuId(skuId);
    const row = {
      'SKU编号': sku.id,
      '商品名称': sku.name,
      '商品分类': sku.category,
      '供应商': supplier?.name || '—',
      '预计到货日期': rep.arrivalDate || '—',
      '规格(每箱)': rep.caseSize,
      '起订箱数': sku.minOrderCases || 0,
      '订货箱数': rep.cases,
      '基础订货量': rep.baseSuggestedQty,
      '活动增量订货': rep.promoExtraQty,
      '订货总数量': rep.adjustedQty,
      '单价(元)': sku.unitPrice,
      '成本价(元)': sku.costPrice || 0,
      '金额(元)': rep.purchaseAmount,
      '毛利(元)': Math.round(rep.grossProfit?.orderProfit * 100) / 100 || 0,
      '当前库存': rep.currentStock,
      '安全库存': rep.safetyStock,
      '7天基础预测': rep.baseTotalForecast,
      '7天活动增量': rep.promoDeltaQty,
      '7天预测总量': rep.totalForecast,
      '缺货风险': rep.stockoutRisk?.label || '—'
    };
    for (let i = 0; i < 7; i++) {
      row[`D${i + 1}基础(${futureDates[i].slice(5)})`] = rep.baseForecast7Days?.[i] || 0;
      row[`D${i + 1}活动增(${futureDates[i].slice(5)})`] = Math.max(0, (rep.forecast7Days?.[i] || 0) - (rep.baseForecast7Days?.[i] || 0));
      row[`D${i + 1}合计(${futureDates[i].slice(5)})`] = rep.forecast7Days?.[i] || 0;
    }
    exportData.push(row);
    totalAmount += rep.purchaseAmount;
    totalQty += rep.adjustedQty;
    totalCases += rep.cases;
    totalBaseQty += rep.baseSuggestedQty;
    totalPromoExtra += rep.promoExtraQty;
  });
  if (exportData.length > 0) {
    exportData.push({
      'SKU编号': '',
      '商品名称': '📊 合计',
      '商品分类': '',
      '供应商': '',
      '预计到货日期': '',
      '规格(每箱)': '',
      '起订箱数': '',
      '订货箱数': totalCases,
      '基础订货量': totalBaseQty,
      '活动增量订货': totalPromoExtra,
      '订货总数量': totalQty,
      '单价(元)': '',
      '成本价(元)': '',
      '金额(元)': Math.round(totalAmount * 100) / 100,
      '毛利(元)': '',
      '当前库存': '',
      '安全库存': '',
      '7天基础预测': '',
      '7天活动增量': '',
      '7天预测总量': ''
    });
  }
  return exportData;
}

function buildSupplierExportData(supplierGroup, futureDates) {
  const rows = [];
  let totalAmount = 0, totalQty = 0, totalCases = 0, totalBaseQty = 0, totalPromoExtra = 0;
  supplierGroup.items.forEach(item => {
    const sku = getSkuById(item.skuId);
    const rep = AppState.replenishmentResults[item.skuId];
    rows.push({
      'SKU编号': item.skuId,
      '商品名称': item.skuName,
      '商品分类': item.category,
      '规格(每箱)': item.caseSize,
      '起订箱数': sku?.minOrderCases || 0,
      '订货箱数': item.cases,
      '基础订货量': item.baseQty,
      '活动增量订货': item.promoExtraQty,
      '订货总数量': item.orderQty,
      '单价(元)': item.unitPrice,
      '成本价(元)': item.costPrice,
      '金额(元)': item.amount,
      '当前库存': rep?.currentStock || 0,
      '安全库存': rep?.safetyStock || 0
    });
    totalAmount += item.amount;
    totalQty += item.orderQty;
    totalCases += item.cases;
    totalBaseQty += item.baseQty;
    totalPromoExtra += item.promoExtraQty;
  });
  rows.push({
    'SKU编号': '',
    '商品名称': `📋 ${supplierGroup.supplierName} - 合计`,
    '商品分类': '',
    '规格(每箱)': '',
    '起订箱数': '',
    '订货箱数': totalCases,
    '基础订货量': totalBaseQty,
    '活动增量订货': totalPromoExtra,
    '订货总数量': totalQty,
    '单价(元)': '',
    '成本价(元)': '',
    '金额(元)': Math.round(totalAmount * 100) / 100,
    '当前库存': '',
    '安全库存': ''
  });
  return rows;
}

function exportPurchaseOrder(selectedSkus, replenishment, futureDates, fileName = null, mode = 'combined') {
  if (typeof XLSX === 'undefined') {
    alert('Excel导出库正在加载，请稍候再试...');
    return;
  }
  const today = new Date().toISOString().split('T')[0];
  const finalFileName = fileName || `采购单_${today}.xlsx`;
  const wb = XLSX.utils.book_new();
  const mainData = buildMainExportData(selectedSkus, replenishment, futureDates);
  if (mainData.length === 0) {
    alert('请先勾选需要采购的商品！');
    return;
  }
  const wsMain = XLSX.utils.json_to_sheet(mainData);
  wsMain['!cols'] = [
    { wch: 10 }, { wch: 22 }, { wch: 10 }, { wch: 18 }, { wch: 12 },
    { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 },
    { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 10 },
    { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
    { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
    { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
    { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
    { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }
  ];
  XLSX.utils.book_append_sheet(wb, wsMain, '采购单汇总');
  if (mode === 'supplier' || mode === 'combined') {
    const supplierGroups = groupBySupplier(replenishment, selectedSkus);
    const summaryRows = [];
    let grandTotal = 0, grandQty = 0, grandCases = 0, grandPromoExtra = 0;
    Object.values(supplierGroups).forEach(g => {
      summaryRows.push({
        '供应商编号': g.supplierId,
        '供应商名称': g.supplierName,
        '联系人': g.contact,
        '联系电话': g.phone,
        '到货提前期(天)': g.leadTimeDays,
        '预计到货日期': g.arrivalDate,
        '最低起订金额(元)': g.minOrderAmount,
        'SKU数': g.items.length,
        '总箱数': g.totalCases,
        '总数量': g.totalQty,
        '活动增量数量': g.promoExtraQty,
        '采购金额(元)': g.totalAmount,
        '是否达到起订额': g.meetsMinOrder ? '是' : '否'
      });
      grandTotal += g.totalAmount;
      grandQty += g.totalQty;
      grandCases += g.totalCases;
      grandPromoExtra += g.promoExtraQty;
      const supRows = buildSupplierExportData(g, futureDates);
      const wsSup = XLSX.utils.json_to_sheet(supRows);
      wsSup['!cols'] = [
        { wch: 10 }, { wch: 22 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
        { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 12 },
        { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }
      ];
      const sheetName = g.supplierName.substring(0, 28).replace(/[\\/?*\[\]:]/g, '_');
      XLSX.utils.book_append_sheet(wb, wsSup, sheetName);
    });
    summaryRows.push({
      '供应商编号': '',
      '供应商名称': '📊 全部供应商合计',
      '联系人': '',
      '联系电话': '',
      '到货提前期(天)': '',
      '预计到货日期': '',
      '最低起订金额(元)': '',
      'SKU数': '',
      '总箱数': grandCases,
      '总数量': grandQty,
      '活动增量数量': grandPromoExtra,
      '采购金额(元)': Math.round(grandTotal * 100) / 100,
      '是否达到起订额': ''
    });
    const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
    wsSummary['!cols'] = [
      { wch: 12 }, { wch: 22 }, { wch: 10 }, { wch: 14 }, { wch: 14 },
      { wch: 14 }, { wch: 14 }, { wch: 8 }, { wch: 10 }, { wch: 10 },
      { wch: 14 }, { wch: 14 }, { wch: 14 }
    ];
    XLSX.utils.book_append_sheet(wb, wsSummary, '供应商汇总');
  }
  XLSX.writeFile(wb, finalFileName);
}

function exportSingleSupplier(selectedSkus, replenishment, supplierId, futureDates) {
  if (typeof XLSX === 'undefined') {
    alert('Excel导出库正在加载，请稍候再试...');
    return;
  }
  const supplier = getSupplierById(supplierId);
  if (!supplier) { alert('供应商不存在！'); return; }
  const supplierGroups = groupBySupplier(replenishment, selectedSkus);
  const group = supplierGroups[supplierId];
  if (!group || group.items.length === 0) { alert('该供应商无采购商品！'); return; }
  const today = new Date().toISOString().split('T')[0];
  const wb = XLSX.utils.book_new();
  const infoRows = [
    { '项目': '供应商编号', '内容': supplier.id },
    { '项目': '供应商名称', '内容': supplier.name },
    { '项目': '联系人', '内容': supplier.contact },
    { '项目': '联系电话', '内容': supplier.phone },
    { '项目': '到货提前期', '内容': supplier.leadTimeDays + ' 天' },
    { '项目': '预计到货日期', '内容': group.arrivalDate },
    { '项目': '最低起订金额', '内容': '¥' + supplier.minOrderAmount },
    { '项目': '本次采购金额', '内容': '¥' + group.totalAmount },
    { '项目': '是否达到起订额', '内容': group.meetsMinOrder ? '是 ✅' : '否 ⚠️' }
  ];
  const wsInfo = XLSX.utils.json_to_sheet(infoRows);
  wsInfo['!cols'] = [{ wch: 16 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, wsInfo, '供应商信息');
  const supRows = buildSupplierExportData(group, futureDates);
  const wsItems = XLSX.utils.json_to_sheet(supRows);
  wsItems['!cols'] = [
    { wch: 10 }, { wch: 22 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
    { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 10 },
    { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 10 }
  ];
  XLSX.utils.book_append_sheet(wb, wsItems, '采购明细');
  const finalFileName = `采购单_${supplier.name}_${today}.xlsx`;
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
