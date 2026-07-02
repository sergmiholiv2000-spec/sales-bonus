/**
 * Функция для расчёта выручки от одной позиции покупки с учётом скидки.
 * @param {Object} purchase — объект позиции из чека (с полями sale_price, discount, quantity)
 * @param {Object|null} _product — карточка товара (в этой реализации не обязательна)
 * @returns {number} Выручка по позиции (число)
 */
function calculateSimpleRevenue(purchase, _product) {
  const { sale_price = 0, discount = 0, quantity = 0 } = purchase;

  if (typeof sale_price !== "number" || typeof quantity !== "number") {
    return 0;
  }

  const discountFactor =
    1 - (typeof discount === "number" ? discount : 0) / 100;
  return sale_price * quantity * discountFactor;
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
  // 1. Проверка входных данных
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

  if (sellers.length === 0 || purchase_records.length === 0) {
    throw new Error(
      "Некорректные входные данные: массивы sellers и purchase_records не должны быть пустыми",
    );
  }

  // 2. Проверка наличия и корректности опций
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

  // 3. Подготовка промежуточных данных для сбора статистики
  const sellerStats = sellers.map((seller) => ({
    seller_id: seller.id,
    name: `${seller.first_name} ${seller.last_name}`,
    revenue: 0,
    profit: 0,
    sales_count: 0,
    products_sold: {}, // { [sku]: quantity }
  }));

  // 4. Индексация продавцов и товаров для быстрого доступа
  const sellerIndex = Object.fromEntries(
    sellerStats.map((s) => [s.seller_id, s]),
  );
  const productIndex = Object.fromEntries(products.map((p) => [p.sku, p]));

  // 5. Расчёт выручки и прибыли для каждого продавца
  purchase_records.forEach((record) => {
    const seller = sellerIndex[record.seller_id];
    if (!seller) {
      return; // Пропускаем чеки с неизвестными продавцами
    }

    // Увеличиваем количество продаж
    seller.sales_count += 1;

    // Выручка по чеку (суммируем по всем позициям через переданную функцию)
    let revenueTotal = 0;
    record.items.forEach((item) => {
      revenueTotal += calculateRevenue(item, productIndex[item.sku]);
    });

    seller.revenue += revenueTotal;

    // Прибыль считаем по каждой позиции отдельно
    record.items.forEach((item) => {
      const product = productIndex[item.sku];
      const costPerUnit = product
        ? typeof product.purchase_price === "number"
          ? product.purchase_price
          : 0
        : 0;
      const quantity = typeof item.quantity === "number" ? item.quantity : 0;
      const costTotal = costPerUnit * quantity;

      const itemRevenue = calculateRevenue(item, product);
      const itemProfit = itemRevenue - costTotal;

      seller.profit += itemProfit;

      // Учёт количества проданных товаров по SKU
      if (!seller.products_sold[item.sku]) {
        seller.products_sold[item.sku] = 0;
      }
      seller.products_sold[item.sku] += quantity;
    });
  });

  // 6. Сортировка продавцов по прибыли (по убыванию)
  sellerStats.sort((a, b) => b.profit - a.profit);

  // 7. Назначение премий на основе ранжирования и формирование топ-10 товаров
  const total = sellerStats.length;

  sellerStats.forEach((seller, index) => {
    // Расчёт бонуса
    seller.bonus = calculateBonus(index, total, seller);

    // Формирование топ-10 товаров
    const topProductsArray = Object.entries(seller.products_sold)
      .map(([sku, quantity]) => ({ sku, quantity }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10);

    seller.top_products = topProductsArray;
  });

  // 8. Подготовка итоговой коллекции с нужными полями и форматированием чисел
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
