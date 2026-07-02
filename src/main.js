/**
 * Функция для расчёта выручки от одной позиции покупки с учётом скидки.
 * @param {Object} purchase — объект позиции из чека (с полями sale_price, discount, quantity)
 * @param {Object|null} _product — карточка товара (в этой реализации не обязательна)
 * @returns {number} Выручка по позиции (число)
 */
function calculateSimpleRevenue(purchase, _product) {
  const { sale_price = 0, discount = 0, quantity = 0 } = purchase;

  if (
    typeof sale_price !== "number" ||
    typeof quantity !== "number" ||
    sale_price < 0 ||
    quantity < 0
  ) {
    return 0;
  }

  const safeDiscount =
    typeof discount === "number" ? Math.min(Math.max(discount, 0), 100) : 0;

  return sale_price * quantity * (1 - safeDiscount / 100);
}

/**
 * Функция расчёта бонуса на основе позиции продавца в рейтинге.
 * @param {number} index — индекс продавца в отсортированном массиве (0 — лучший)
 * @param {number} total — общее количество продавцов
 * @param {Object} seller — объект продавца (обязательно поле profit)
 * @returns {number} Бонус в рублях
 */
function calculateBonusByProfit(index, total, seller) {
  const { profit = 0 } = seller;

  if (total === 0) {
    return 0;
  }

  let percent = 0;

  if (index === 0) {
    percent = 15;
  } else if (index === 1 || index === 2) {
    percent = 10;
  } else if (index === total - 1) {
    percent = 0;
  } else {
    percent = 5;
  }

  return profit * (percent / 100);
}

/**
 * Главная функция анализа данных продаж.
 * @param {Object} data — исходные данные (sellers, purchase_records, products)
 * @param {Object} options — настройки: { calculateRevenue, calculateBonus }
 * @returns {Array} Массив отчётов по продавцам
 */
function analyzeSalesData(data, options) {
  if (!data || typeof data !== "object") {
    throw new Error("Некорректные входные данные");
  }

  const { sellers = [], purchase_records = [], products = [] } = data;

  if (
    !Array.isArray(sellers) ||
    !Array.isArray(purchase_records) ||
    !Array.isArray(products)
  ) {
    throw new Error(
      "Некорректные входные данные: sellers, purchase_records и products должны быть массивами",
    );
  }

  if (!options || typeof options !== "object") {
    throw new Error("Опции должны быть объектом");
  }

  const { calculateRevenue, calculateBonus } = options;

  if (
    typeof calculateRevenue !== "function" ||
    typeof calculateBonus !== "function"
  ) {
    throw new Error(
      "В опциях должны быть переданы функции calculateRevenue и calculateBonus",
    );
  }

  const sellerStats = sellers.map((seller) => ({
    seller_id: seller.id,
    name: `${seller.first_name ?? ""} ${seller.last_name ?? ""}`.trim(),
    revenue: 0,
    profit: 0,
    sales_count: 0,
    products_sold: {},
  }));

  const sellerIndex = Object.fromEntries(
    sellerStats.map((s) => [s.seller_id, s]),
  );
  const productIndex = Object.fromEntries(products.map((p) => [p.sku, p]));

  purchase_records.forEach((record) => {
    const seller = sellerIndex[record.seller_id];
    if (!seller || !Array.isArray(record.items)) {
      return;
    }

    seller.sales_count += 1;

    record.items.forEach((item) => {
      const product = productIndex[item.sku];
      const quantity =
        typeof item.quantity === "number" && item.quantity > 0
          ? item.quantity
          : 0;

      const itemRevenue = calculateRevenue(item, product);
      const costPerUnit =
        product && typeof product.purchase_price === "number"
          ? product.purchase_price
          : 0;

      seller.revenue += itemRevenue;
      seller.profit += itemRevenue - costPerUnit * quantity;

      if (!seller.products_sold[item.sku]) {
        seller.products_sold[item.sku] = 0;
      }
      seller.products_sold[item.sku] += quantity;
    });
  });

  sellerStats.sort((a, b) => {
    if (b.profit !== a.profit) return b.profit - a.profit;
    return b.revenue - a.revenue;
  });

  const total = sellerStats.length;

  sellerStats.forEach((seller, index) => {
    seller.bonus = calculateBonus(index, total, seller);

    seller.top_products = Object.entries(seller.products_sold)
      .map(([sku, quantity]) => ({ sku, quantity }))
      .sort((a, b) => {
        if (b.quantity !== a.quantity) return b.quantity - a.quantity;
        return String(a.sku).localeCompare(String(b.sku));
      })
      .slice(0, 10);
  });

  return sellerStats.map((seller) => ({
    seller_id: seller.seller_id,
    name: seller.name,
    revenue: +seller.revenue.toFixed(2),
    profit: +seller.profit.toFixed(2),
    sales_count: seller.sales_count,
    top_products: seller.top_products,
    bonus: +seller.bonus.toFixed(2),
  }));
}
