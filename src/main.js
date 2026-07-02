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
  if (!data || typeof data !== "object") {
    throw new Error("Некорректные входные данные");
  }

  const { sellers, purchase_records, products } = data;

  if (
    !Array.isArray(sellers) ||
    !Array.isArray(purchase_records) ||
    !Array.isArray(products)
  ) {
    throw new Error("Некорректные входные данные");
  }
  if (
    sellers.length === 0 ||
    purchase_records.length === 0 ||
    products.length === 0
  ) {
    throw new Error("Некорректные входные данные");
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

  // Индексы для быстрого доступа
  const productIndex = Object.fromEntries(products.map((p) => [p.sku, p]));

  const sellerStats = sellers.map((seller) => ({
    seller_id: seller.id,
    name: `${seller.first_name} ${seller.last_name}`,
    revenue: 0,
    profit: 0,
    sales_count: 0,
    products_sold: {}, // { [sku]: quantity }
  }));

  const sellerIndex = Object.fromEntries(
    sellerStats.map((s) => [s.seller_id, s]),
  );

  purchase_records.forEach((record) => {
    const seller = sellerIndex[record.seller_id];
    if (!seller) return;

    // Считаем выручку по позициям чека
    let revenueTotal = 0;
    record.items.forEach((item) => {
      revenueTotal += calculateRevenue(item, productIndex[item.sku]);
    });

    seller.revenue += revenueTotal;
    seller.sales_count += 1;

    // Прибыль по каждой позиции
    record.items.forEach((item) => {
      const product = productIndex[item.sku];
      const costPerUnit =
        product && typeof product.purchase_price === "number"
          ? product.purchase_price
          : 0;
      const quantity = typeof item.quantity === "number" ? item.quantity : 0;

      const itemRevenue = calculateRevenue(item, product);
      const itemProfit = itemRevenue - costPerUnit * quantity;

      seller.profit += itemProfit;

      if (!seller.products_sold[item.sku]) {
        seller.products_sold[item.sku] = 0;
      }
      seller.products_sold[item.sku] += quantity;
    });
  });

  // Сортировка продавцов по прибыли (убывание)
  sellerStats.sort((a, b) => b.profit - a.profit);

  const total = sellerStats.length;

  sellerStats.forEach((seller, index) => {
    seller.bonus = calculateBonus(index, total, seller);

    // Формируем топ‑10 товаров: сначала по количеству (убывание), потом по sku (возрастание)
    const topProductsArray = Object.entries(seller.products_sold)
      .map(([sku, quantity]) => ({ sku, quantity }))
      .sort((a, b) => {
        if (b.quantity !== a.quantity) {
          return b.quantity - a.quantity;
        }
        return a.sku.localeCompare(b.sku);
      })
      .slice(0, 10);

    seller.top_products = topProductsArray;
  });

  return sellerStats.map((seller) => ({
    seller_id: seller.seller_id,
    name: seller.name,
    revenue: Math.round(seller.revenue * 100) / 100,
    profit: Math.round(seller.profit * 100) / 100,
    sales_count: seller.sales_count,
    top_products: seller.top_products,
    bonus: Math.round(seller.bonus * 100) / 100,
  }));
}
