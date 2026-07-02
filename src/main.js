/**
 * Группировка массива по ключу
 * @param array
 * @param keyFn
 * @returns {*}
 */
function groupBy(array, keyFn) {
  return array.reduce((acc, item) => {
    const key = keyFn(item);
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
}

/**
 * Анализ последовательности чисел на устойчивость, возрастание и убывание
 * @param sequence
 * @param tolerance
 * @returns {{isIncreasing: boolean, isDecreasing: boolean, isStable: boolean}}
 */

function analyzeSequence(sequence, tolerance = 0.05) {
  const trends = {
    isStable: true,
    isIncreasing: true,
    isDecreasing: true,
  };

  if (sequence.length < 2) {
    // Для 0–1 элемента считаем всё true, кроме случаев, когда явно требуется иначе
    return trends;
  }

  for (let i = 1; i < sequence.length; i++) {
    const prev = sequence[i - 1];
    const curr = sequence[i];

    if (prev === 0) {
      // Если предыдущее 0, относительное изменение не определено; считаем как «не стабильно»
      trends.isStable = false;
      continue;
    }

    const relativeChange = Math.abs(curr - prev) / Math.abs(prev);
    if (relativeChange > tolerance) {
      trends.isStable = false;
    }

    if (curr < prev) trends.isIncreasing = false;
    if (curr > prev) trends.isDecreasing = false;
  }

  return trends;
}

/**
 * Вычисление среднего значения
 * @param values
 * @returns {number}
 */
function calculateAverage(values) {
  const sum = values.reduce((acc, value) => acc + value, 0);
  return sum / values.length || 0;
}

/**
 * Получение N элементов с наибольшим значением ключа
 * @param array
 * @param key
 * @param n
 * @returns {*}
 */
function getTopN(array, key, n) {
  return array.sort((a, b) => b[key] - a[key]).slice(0, n);
}

/**
 * Вычисление бонусов по специальным условиям
 * @param data
 * @param options {{accumulateMetrics: ((function(*, *, *): *)|*), calculateProfit: ((function(*, *): number)|*)}}
 * @param bonusFunctions
 * @returns {*}
 */
function calculateSpecialBonuses(data, options, bonusFunctions) {
  const { calculateProfit, accumulateMetrics } = options;
  // Группировка данных
  const recordsBySeller = groupBy(
    data.purchase_records,
    (record) => record.seller_id,
  );
  const recordsByCustomer = groupBy(
    data.purchase_records,
    (record) => record.customer_id,
  );
  const recordsByProduct = groupBy(
    data.purchase_records.flatMap((record) => record.items),
    (item) => item.sku,
  );

  // Накопительная статистика
  const stats = accumulateMetrics(
    data.purchase_records,
    calculateProfit,
    data.products,
  );

  // Вызов функций для расчёта бонусов
  return bonusFunctions.map((func) =>
    func({
      stats,
      recordsBySeller,
      recordsByCustomer,
      recordsByProduct,
      sellers: data.sellers,
      customers: data.customers,
      products: data.products,
      calculateProfit,
    }),
  );
}

// 1. Продавец, привлекший лучшего покупателя
function bonusBestCustomer({ stats }) {
  const customers = Object.values(stats.customers);
  if (customers.length === 0) {
    return { category: "Best Customer Seller", seller_id: null, bonus: 0 };
  }

  const bestCustomer = customers.reduce(
    (max, data) => (data.revenue > (max?.revenue ?? -Infinity) ? data : max),
    null,
  );

  if (
    !bestCustomer ||
    !bestCustomer.sellers ||
    bestCustomer.sellers.size === 0
  ) {
    return { category: "Best Customer Seller", seller_id: null, bonus: 0 };
  }

  let topSeller = null;
  let maxRevenue = -Infinity;

  for (const sellerId of bestCustomer.sellers) {
    const revenue = stats.sellers[sellerId]?.revenue ?? 0;
    if (revenue > maxRevenue) {
      maxRevenue = revenue;
      topSeller = sellerId;
    }
  }

  return {
    category: "Best Customer Seller",
    seller_id: topSeller,
    bonus: Math.round(bestCustomer.revenue * 0.05 * 100) / 100,
  };
}

// 2. Продавец, лучше всего удерживающий покупателя
function bonusCustomerRetention({ stats }) {
  const bestRetention = Object.entries(stats.sellers).reduce(
    (best, [sellerId, data]) => {
      const customerCounts = Array.from(data.customers).map(
        (customerId) => stats.customers[customerId]?.revenue || 0,
      );
      const maxCustomerRevenue = Math.max(...customerCounts);

      return maxCustomerRevenue > (best?.revenue || 0)
        ? { sellerId, revenue: maxCustomerRevenue }
        : best;
    },
    null,
  );

  return {
    category: "Best Customer Retention",
    seller_id: bestRetention.sellerId,
    bonus: 1000,
  };
}

// 3. Продавец, привлекший клиента с наибольшим чеком
function bonusLargestSingleSale({ recordsBySeller }) {
  let largestSale = null;
  let maxAmount = -Infinity;

  for (const [sellerId, records] of Object.entries(recordsBySeller)) {
    for (const record of records) {
      const amount = record.total_amount ?? 0;
      if (amount > maxAmount) {
        maxAmount = amount;
        largestSale = { ...record, seller_id: sellerId };
      }
    }
  }

  if (!largestSale) {
    return { category: "Largest Single Sale", seller_id: null, bonus: 0 };
  }

  return {
    category: "Largest Single Sale",
    seller_id: largestSale.seller_id,
    bonus: Math.round(largestSale.total_amount * 0.1 * 100) / 100,
  };
}

// 4. Продавец с наибольшей средней прибылью
function bonusHighestAverageProfit({ stats }) {
  const sellers = Object.values(stats.sellers);
  if (sellers.length === 0) {
    return { category: "Highest Average Profit", seller_id: null, bonus: 0 };
  }

  const bestSeller = sellers.reduce((max, data) => {
    const count = data.items.length;
    const avgProfit = count === 0 ? 0 : data.profit / count;
    return avgProfit > (max?.avgProfit ?? -Infinity)
      ? { sellerId: data.seller_id, avgProfit }
      : max;
  }, null);

  if (!bestSeller) {
    return { category: "Highest Average Profit", seller_id: null, bonus: 0 };
  }

  return {
    category: "Highest Average Profit",
    seller_id: bestSeller.sellerId,
    bonus: Math.round(bestSeller.avgProfit * 0.1 * 100) / 100,
  };
}

// 5. Продавец со стабильно растущей средней прибылью
function bonusStableGrowth({ recordsBySeller, calculateProfit, products }) {
  const bestSeller = Object.entries(recordsBySeller).reduce(
    (best, [sellerId, records]) => {
      const monthlyProfits = groupBy(records, (record) =>
        record.date.slice(0, 7),
      );
      const monthlyAverages = Object.entries(monthlyProfits)
        .sort(([a], [b]) => new Date(a) - new Date(b))
        .map(([month, records]) =>
          calculateAverage(
            records.flatMap((record) =>
              record.items.map((item) =>
                calculateProfit(
                  item,
                  products.find((p) => p.sku === item.sku),
                ),
              ),
            ),
          ),
        );

      const { isStable, isIncreasing } = analyzeSequence(monthlyAverages, 0.05);

      if (isStable && isIncreasing) {
        const avgProfit = calculateAverage(monthlyAverages);
        return avgProfit > (best?.avgProfit || 0)
          ? { sellerId, avgProfit }
          : best;
      }

      return best;
    },
    null,
  );

  return {
    category: "Stable Growth",
    seller_id: bestSeller?.sellerId,
    bonus: +(bestSeller ? bestSeller.avgProfit * 0.15 : 0).toFixed(2),
  };
}

/**
 * Простой расчёт прибыли
 * @param item
 * @param product
 * @returns {number}
 */
function simpleProfit(item, product) {
  return (
    item.sale_price * item.quantity * (1 - item.discount / 100) -
    product.purchase_price * item.quantity
  );
}

/**
 * Накопительное вычисление прибыли, выручки и других метрик
 * @param records
 * @param calculateProfit
 * @param products
 * @returns {*}
 */

function baseMetrics(records, calculateProfit, products) {
  const productIndex = Object.fromEntries(products.map((p) => [p.sku, p]));

  return records.reduce(
    (acc, record) => {
      const sellerId = record.seller_id;
      const customerId = record.customer_id;

      if (!acc.sellers[sellerId]) {
        acc.sellers[sellerId] = {
          revenue: 0,
          profit: 0,
          items: [],
          customers: new Set(),
        };
      }
      if (!acc.customers[customerId]) {
        acc.customers[customerId] = {
          revenue: 0,
          profit: 0,
          sellers: new Set(),
        };
      }

      record.items.forEach((item) => {
        const product = productIndex[item.sku];
        const profit = calculateProfit(item, product);

        const itemRevenue =
          item.sale_price * item.quantity * (1 - item.discount / 100);

        acc.sellers[sellerId].revenue += itemRevenue;
        acc.sellers[sellerId].profit += profit;
        acc.sellers[sellerId].items.push(item);
        acc.sellers[sellerId].customers.add(customerId);

        acc.customers[customerId].revenue += itemRevenue;
        acc.customers[customerId].profit += profit;
        acc.customers[customerId].sellers.add(sellerId);

        if (!acc.products[item.sku]) {
          acc.products[item.sku] = { quantity: 0, revenue: 0 };
        }
        acc.products[item.sku].quantity += item.quantity;
        acc.products[item.sku].revenue += itemRevenue;
      });

      return acc;
    },
    { sellers: {}, customers: {}, products: {} },
  );
}
