function calculateSimpleRevenue(purchase, _product) {
  const { sale_price = 0, discount = 0, quantity = 0 } = purchase;

  if (typeof sale_price !== "number" || typeof quantity !== "number") {
    return 0;
  }

  const discountFactor =
    1 - (typeof discount === "number" ? discount : 0) / 100;
  return sale_price * quantity * discountFactor;
}

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

function analyzeSalesData(data, options) {
  // 1. Проверка входных данных
  if (!data || typeof data !== "object") {
    throw new Error("Некорректные входные данные");
  }

  const { sellers, purchase_records, products } = data;

  // Проверка, что поля существуют и это массивы
  if (!Array.isArray(sellers)) {
    throw new Error("Некорректные входные данные");
  }
  if (!Array.isArray(purchase_records)) {
    throw new Error("Некорректные входные данные");
  }
  if (!Array.isArray(products)) {
    throw new Error("Некорректные входные данные");
  }

  // Проверка на пустые массивы (по требованиям тестов)
  if (sellers.length === 0) {
    throw new Error("Некорректные входные данные");
  }
  if (purchase_records.length === 0) {
    throw new Error("Некорректные входные данные");
  }
  // products может быть пустым? По тестам — нет, тоже кидаем ошибку
  if (products.length === 0) {
    throw new Error("Некорректные входные данные");
  }

  // 2. Проверка опций
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

  // 3. Подготовка статистики по продавцам
  const sellerStats = sellers.map((seller) => ({
    seller_id: seller.id,
    name: `${seller.first_name} ${seller.last_name}`,
    revenue: 0,
    profit: 0,
    sales_count: 0,
    products_sold: {}, // { [sku]: quantity }
  }));

  // 4. Индексы для быстрого доступа
  const sellerIndex = Object.fromEntries(
    sellerStats.map((s) => [s.seller_id, s]),
  );
  const productIndex = Object.fromEntries(products.map((p) => [p.sku, p]));

  // 5. Сбор статистики
  purchase_records.forEach((record) => {
    const seller = sellerIndex[record.seller_id];
    if (!seller) {
      return; // Пропускаем чеки с неизвестными продавцами
    }

    // Считаем выручку по всем позициям чека через переданную функцию
    let revenueTotal = 0;
    record.items.forEach((item) => {
      revenueTotal += calculateRevenue(item, productIndex[item.sku]);
    });

    seller.revenue += revenueTotal;
    seller.sales_count += 1;

    // Прибыль считаем по каждой позиции
    record.items.forEach((item) => {
      const product = productIndex[item.sku];
      const costPerUnit =
        product && typeof product.purchase_price === "number"
          ? product.purchase_price
          : 0;
      const quantity = typeof item.quantity === "number" ? item.quantity : 0;
      const costTotal = costPerUnit * quantity;

      const itemRevenue = calculateRevenue(item, product);
      const itemProfit = itemRevenue - costTotal;

      seller.profit += itemProfit;

      // Накопление количества по SKU
      if (!seller.products_sold[item.sku]) {
        seller.products_sold[item.sku] = 0;
      }
      seller.products_sold[item.sku] += quantity;
    });
  });

  // 6. Сортировка по прибыли (убывание)
  sellerStats.sort((a, b) => b.profit - a.profit);

  // 7. Бонусы и топ‑10 товаров
  const total = sellerStats.length;

  sellerStats.forEach((seller, index) => {
    seller.bonus = calculateBonus(index, total, seller);

    const topProductsArray = Object.entries(seller.products_sold)
      .map(([sku, quantity]) => ({ sku, quantity }))
      .sort((a, b) => {
        // Сначала по количеству (убывание), потом по sku (возрастание) — это важно для детерминизма
        if (b.quantity !== a.quantity) {
          return b.quantity - a.quantity;
        }
        return a.sku.localeCompare(b.sku);
      })
      .slice(0, 10);

    seller.top_products = topProductsArray;
  });

  // 8. Формирование итогового результата
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
