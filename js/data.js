const SKU_DATA = [
  {
    id: "SKU001",
    name: "可口可乐 330ml",
    category: "饮料",
    unitPrice: 3.5,
    caseSize: 24,
    safetyStockDays: 3,
    currentStock: 120,
    avgStockMonth: 150,
    promotionElasticity: 1.5
  },
  {
    id: "SKU002",
    name: "农夫山泉 550ml",
    category: "饮料",
    unitPrice: 2.0,
    caseSize: 24,
    safetyStockDays: 3,
    currentStock: 250,
    avgStockMonth: 280,
    promotionElasticity: 1.2
  },
  {
    id: "SKU003",
    name: "乐事薯片 原味 70g",
    category: "零食",
    unitPrice: 8.5,
    caseSize: 20,
    safetyStockDays: 4,
    currentStock: 45,
    avgStockMonth: 80,
    promotionElasticity: 1.8
  },
  {
    id: "SKU004",
    name: "奥利奥饼干 原味 116g",
    category: "零食",
    unitPrice: 12.8,
    caseSize: 24,
    safetyStockDays: 4,
    currentStock: 18,
    avgStockMonth: 50,
    promotionElasticity: 1.6
  },
  {
    id: "SKU005",
    name: "康师傅红烧牛肉面",
    category: "方便食品",
    unitPrice: 4.5,
    caseSize: 24,
    safetyStockDays: 5,
    currentStock: 80,
    avgStockMonth: 120,
    promotionElasticity: 1.3
  },
  {
    id: "SKU006",
    name: "三只松鼠每日坚果",
    category: "零食",
    unitPrice: 29.9,
    caseSize: 12,
    safetyStockDays: 5,
    currentStock: 12,
    avgStockMonth: 25,
    promotionElasticity: 2.0
  },
  {
    id: "SKU007",
    name: "伊利纯牛奶 250ml",
    category: "乳制品",
    unitPrice: 3.8,
    caseSize: 24,
    safetyStockDays: 3,
    currentStock: 30,
    avgStockMonth: 180,
    promotionElasticity: 1.4
  },
  {
    id: "SKU008",
    name: "老干妈风味豆豉 280g",
    category: "调味品",
    unitPrice: 11.5,
    caseSize: 24,
    safetyStockDays: 7,
    currentStock: 8,
    avgStockMonth: 15,
    promotionElasticity: 1.1
  },
  {
    id: "SKU009",
    name: "海飞丝洗发水 400ml",
    category: "个护",
    unitPrice: 45.9,
    caseSize: 12,
    safetyStockDays: 7,
    currentStock: 15,
    avgStockMonth: 20,
    promotionElasticity: 1.7
  },
  {
    id: "SKU010",
    name: "维达抽纸 3层100抽",
    category: "日用",
    unitPrice: 6.5,
    caseSize: 30,
    safetyStockDays: 5,
    currentStock: 60,
    avgStockMonth: 95,
    promotionElasticity: 1.5
  }
];

function seededRandom(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function generateSales(baseDaily, seed, trend = 0, weekendFactor = 1.2) {
  const history = [];
  const actualFuture = [];
  for (let i = 0; i < 30; i++) {
    const dayOfWeek = (i + 2) % 7;
    const isWeekend = dayOfWeek >= 5;
    const weekendBoost = isWeekend ? weekendFactor : 1.0;
    const trendBoost = 1 + (trend * i / 30);
    const noise = 0.8 + seededRandom(seed + i * 0.17) * 0.4;
    history.push(Math.max(0, Math.round(baseDaily * weekendBoost * trendBoost * noise)));
  }
  for (let i = 30; i < 37; i++) {
    const dayOfWeek = (i + 2) % 7;
    const isWeekend = dayOfWeek >= 5;
    const weekendBoost = isWeekend ? weekendFactor : 1.0;
    const trendBoost = 1 + (trend * i / 30);
    const noise = 0.8 + seededRandom(seed + i * 0.23) * 0.4;
    actualFuture.push(Math.max(0, Math.round(baseDaily * weekendBoost * trendBoost * noise)));
  }
  return { history, actualFuture };
}

const SALES_DATA = {
  "SKU001": generateSales(45, 1001, 0.05),
  "SKU002": generateSales(80, 1002, 0.02),
  "SKU003": generateSales(18, 1003, -0.03),
  "SKU004": generateSales(10, 1004, 0.08),
  "SKU005": generateSales(30, 1005, 0.01),
  "SKU006": generateSales(5, 1006, 0.12),
  "SKU007": generateSales(55, 1007, -0.01),
  "SKU008": generateSales(3, 1008, 0.00),
  "SKU009": generateSales(4, 1009, 0.03),
  "SKU010": generateSales(22, 1010, 0.04)
};

const CATEGORIES = [...new Set(SKU_DATA.map(s => s.category))];

function getSkuById(id) {
  return SKU_DATA.find(s => s.id === id);
}

function getSalesBySku(id) {
  return SALES_DATA[id];
}

function getFutureDates(startDateStr = null) {
  const dates = [];
  const start = startDateStr ? new Date(startDateStr) : new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i + 1);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}
