import { registerRpc } from '../services/rpc';
import { ipcMain } from 'electron'
import { mainWindow } from '../main';
import { db } from '../database'
import log from 'electron-log'

export function setupAnalyticsHandlers() {
  registerRpc('analytics:get-stats', async (_event, companyId: string, startDate?: string, endDate?: string) => {
    try {
      if (!db) throw new Error('Database not initialized');

      // Для простоты пока берем за все время, если нет дат
      let dateFilter = '';
      const params: any[] = [companyId];
      if (startDate && endDate) {
        dateFilter = 'AND r.created_at BETWEEN ? AND ?';
        params.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);
      }

      // 1. KPI (Total Revenue, Returns, Avg Ticket)
      const kpis = db.prepare(`
        SELECT 
          SUM(CASE WHEN r.type = 'sale' THEN total_amount ELSE 0 END) as total_sales,
          SUM(CASE WHEN r.type = 'return' THEN total_amount ELSE 0 END) as total_returns,
          COUNT(CASE WHEN r.type = 'sale' THEN 1 END) as receipts_count
        FROM receipts r
        WHERE r.company_id = ? ${dateFilter}
      `).get(...params) as any;

      const avgTicket = kpis.receipts_count > 0 ? (kpis.total_sales / kpis.receipts_count) : 0;

      // 2. Sales by day (Last 30 days or filtered)
      const salesByDayParams: any[] = [companyId];
      let salesByDayFilter = '';
      if (startDate && endDate) {
        salesByDayFilter = 'AND created_at BETWEEN ? AND ?';
        salesByDayParams.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);
      } else {
        salesByDayFilter = 'AND created_at >= date(\'now\', \'-30 days\')';
      }

      const salesByDay = db.prepare(`
        SELECT DATE(created_at) as date, SUM(total_amount) as revenue 
        FROM receipts 
        WHERE type = 'sale' AND company_id = ? ${salesByDayFilter}
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      `).all(...salesByDayParams);

      // 3. Top Products (ABC Analysis by revenue)
      const topProducts = db.prepare(`
        SELECT 
          p.name, 
          p.barcode,
          SUM(ri.quantity) as sold_qty, 
          SUM(ri.total) as revenue 
        FROM receipt_items ri
        JOIN receipts r ON r.id = ri.receipt_id
        JOIN products p ON p.id = ri.product_id
        WHERE r.type = 'sale' AND r.company_id = ? ${dateFilter}
        GROUP BY p.id
        ORDER BY revenue DESC
        LIMIT 50
      `).all(...params);

      // Calculate ABC Classes based on revenue
      const totalRevenueTop = topProducts.reduce((sum: number, item: any) => sum + (item.revenue as number), 0) as number;
      let cumulativeRevenue = 0;

      const abcAnalysis = topProducts.map((p: any) => {
        cumulativeRevenue += (p.revenue as number);
        const cumulativePercent = totalRevenueTop > 0 ? (cumulativeRevenue / totalRevenueTop) * 100 : 0;

        let abcClass = 'C';
        if (cumulativePercent <= 80) abcClass = 'A';
        else if (cumulativePercent <= 95) abcClass = 'B';

        return {
          ...p,
          percent: totalRevenueTop > 0 ? ((p.revenue as number) / totalRevenueTop) * 100 : 0,
          cumulativePercent,
          abcClass
        };
      });

      // 4. Today's sales
      const todayStats = db.prepare(`
        SELECT 
          COALESCE(SUM(CASE WHEN type = 'sale' THEN total_amount ELSE 0 END), 0) as todaySales,
          COUNT(CASE WHEN type = 'sale' THEN 1 END) as receiptCount
        FROM receipts
        WHERE company_id = ? AND DATE(created_at) = DATE('now')
      `).get(companyId) as any;

      // 5. Month sales
      const monthStats = db.prepare(`
        SELECT COALESCE(SUM(total_amount), 0) as monthSales
        FROM receipts
        WHERE company_id = ? AND type = 'sale' AND created_at >= date('now', 'start of month')
      `).get(companyId) as any;

      // 6. Low stock items
      const lowStock = db.prepare(`
        SELECT COUNT(*) as count FROM (
          SELECT p.id, SUM(i.quantity) as total_qty FROM products p
          JOIN inventory i ON p.id = i.product_id AND i.company_id = p.company_id
          WHERE p.company_id = ?
          GROUP BY p.id
          HAVING total_qty <= 5 AND total_qty > 0
        )
      `).get(companyId) as any;

      // 7. Chart data (last 7 days)
      const chartData = db.prepare(`
        SELECT 
          CASE strftime('%w', DATE(created_at))
            WHEN '0' THEN 'Вс'
            WHEN '1' THEN 'Пн'
            WHEN '2' THEN 'Вт'
            WHEN '3' THEN 'Ср'
            WHEN '4' THEN 'Чт'
            WHEN '5' THEN 'Пт'
            WHEN '6' THEN 'Сб'
          END as name,
          COALESCE(SUM(total_amount), 0) as value
        FROM receipts
        WHERE type = 'sale' AND company_id = ? AND created_at >= date('now', '-6 days')
        GROUP BY DATE(created_at)
        ORDER BY DATE(created_at) ASC
      `).all(companyId);

      // Format top products for Dashboard
      const topForDashboard = abcAnalysis.slice(0, 5).map((p: any) => ({
        name: p.name,
        count: p.sold_qty || 0,
        price: Math.round((p.revenue || 0) / Math.max(p.sold_qty || 1, 1))
      }));

      return {
        success: true,
        data: {
          todaySales: todayStats?.todaySales || 0,
          monthSales: monthStats?.monthSales || 0,
          receiptCount: todayStats?.receiptCount || 0,
          lowStockItems: lowStock?.count || 0,
          chartData,
          topProducts: topForDashboard,
          kpis: {
            totalSales: kpis.total_sales || 0,
            totalReturns: kpis.total_returns || 0,
            receiptsCount: kpis.receipts_count || 0,
            avgTicket
          },
          salesByDay,
          abcAnalysis
        }
      };

    } catch (error) {
      log.error('Failed to get analytics stats:', error);
      return { success: false, error: 'Ошибка получения аналитики' };
    }
  });

  // Валовая прибыль
  registerRpc('analytics:gross-profit', async (_event, companyId: string, startDate?: string, endDate?: string) => {
    try {
      if (!db) throw new Error('Database not initialized');

      let dateFilter = '';
      const params: any[] = [companyId];
      if (startDate && endDate) {
        dateFilter = 'AND r.created_at BETWEEN ? AND ?';
        params.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);
      }

      // Суммарные KPI
      const summary = db.prepare(`
        SELECT
          COALESCE(SUM(ri.total), 0) as total_revenue,
          COALESCE(SUM(ri.quantity * p.price_purchase), 0) as total_cost,
          COUNT(DISTINCT r.id) as receipts_count
        FROM receipt_items ri
        JOIN receipts r ON r.id = ri.receipt_id
        JOIN products p ON p.id = ri.product_id
        WHERE r.type = 'sale' AND r.company_id = ? ${dateFilter}
      `).get(...params) as any;

      const totalRevenue = summary.total_revenue || 0;
      const totalCost = summary.total_cost || 0;
      const grossProfit = totalRevenue - totalCost;
      const margin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

      // По товарам
      const products = db.prepare(`
        SELECT
          p.name,
          p.barcode,
          SUM(ri.quantity) as sold_qty,
          SUM(ri.total) as revenue,
          SUM(ri.quantity * p.price_purchase) as cost,
          SUM(ri.total) - SUM(ri.quantity * p.price_purchase) as profit,
          CASE WHEN SUM(ri.total) > 0
            THEN ((SUM(ri.total) - SUM(ri.quantity * p.price_purchase)) / SUM(ri.total)) * 100
            ELSE 0
          END as margin_pct
        FROM receipt_items ri
        JOIN receipts r ON r.id = ri.receipt_id
        JOIN products p ON p.id = ri.product_id
        WHERE r.type = 'sale' AND r.company_id = ? ${dateFilter}
        GROUP BY p.id
        ORDER BY profit DESC
      `).all(...params);

      return {
        success: true,
        data: {
          totalRevenue,
          totalCost,
          grossProfit,
          margin,
          receiptsCount: summary.receipts_count || 0,
          products
        }
      };
    } catch (error) {
      log.error('Failed to get gross profit:', error);
      return { success: false, error: 'Ошибка расчёта валовой прибыли' };
    }
  });

  // Налоговый регистр
  registerRpc('analytics:tax-register', async (_event, companyId: string, startDate?: string, endDate?: string) => {
    try {
      if (!db) throw new Error('Database not initialized');

      let dateFilter = '';
      const params: any[] = [companyId];
      if (startDate && endDate) {
        dateFilter = 'AND r.created_at BETWEEN ? AND ?';
        params.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);
      }

      // Получаем все проданные товары с информацией об НДС
      const items = db.prepare(`
        SELECT
          r.created_at as date,
          r.receipt_number,
          p.name,
          ri.quantity,
          ri.total,
          p.vat_rate as vat_rate_orig
        FROM receipt_items ri
        JOIN receipts r ON r.id = ri.receipt_id
        JOIN products p ON p.id = ri.product_id
        WHERE r.type = 'sale' AND r.company_id = ? ${dateFilter}
        ORDER BY r.created_at ASC
      `).all(...params) as any[];

      let totalAmount = 0;
      let totalVat = 0;
      let totalNet = 0;

      const formattedItems = items.map(item => {
        const rate = parseFloat(item.vat_rate_orig || '0');
        const vatAmount = rate > 0 ? (item.total * (rate / (100 + rate))) : 0;
        const netAmount = item.total - vatAmount;

        totalAmount += item.total;
        totalVat += vatAmount;
        totalNet += netAmount;

        return {
          date: new Date(item.date).toLocaleString('ru-RU'),
          receipt_number: String(item.receipt_number).padStart(6, '0'),
          name: item.name,
          quantity: item.quantity,
          total: Math.round(item.total),
          vat_rate: rate,
          vat_amount: Math.round(vatAmount),
          net_amount: Math.round(netAmount)
        };
      });

      return {
        success: true,
        data: {
          totalAmount: Math.round(totalAmount),
          totalVat: Math.round(totalVat),
          totalNet: Math.round(totalNet),
          items: formattedItems
        }
      };
    } catch (error) {
      log.error('Failed to get tax register:', error);
      return { success: false, error: 'Ошибка формирования налогового регистра' };
    }
  });

  // Оценка склада (Valuation)
  registerRpc('analytics:valuation-report', async (_event, companyId: string, filter: any) => {
    try {
      if (!db) throw new Error('Database not initialized');
      const { endDate, warehouseId, categoryId } = filter || {};

      let query = `
        SELECT 
          p.id, p.name, p.barcode, p.measure_unit, p.price_purchase, p.price_retail,
          c.name as category_name,
          COALESCE(SUM(i.quantity), 0) as current_qty
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        LEFT JOIN inventory i ON p.id = i.product_id AND i.company_id = p.company_id
      `;

      if (warehouseId) {
        query += ` AND i.warehouse_id = @warehouseId`;
      }

      query += ` WHERE p.company_id = @companyId AND p.is_deleted = 0`;

      if (categoryId) {
        query += ` AND p.category_id = @categoryId`;
      }

      query += ` GROUP BY p.id ORDER BY p.name ASC`;

      const products = db.prepare(query).all({ companyId, warehouseId, categoryId }) as any[];

      // If endDate is provided, we need to adjust current_qty backwards to the endDate.
      // EndStock = CurrentStock + Sales(Since EndDate) - Purchases(Since EndDate) + ...
      if (endDate) {
        const endDateTime = `${endDate} 23:59:59`;

        // Sales after endDate
        let salesQuery = `
          SELECT ri.product_id, SUM(ri.quantity) as qty
          FROM receipt_items ri
          JOIN receipts r ON r.id = ri.receipt_id
          WHERE r.company_id = @companyId AND r.type = 'sale' AND r.created_at > @endDateTime
        `;
        const salesSince = db.prepare(salesQuery + " GROUP BY ri.product_id").all({ companyId, endDateTime }) as any[];

        // Returns after endDate
        let returnsQuery = `
          SELECT ri.product_id, SUM(ri.quantity) as qty
          FROM receipt_items ri
          JOIN receipts r ON r.id = ri.receipt_id
          WHERE r.company_id = @companyId AND r.type = 'return' AND r.created_at > @endDateTime
        `;
        const returnsSince = db.prepare(returnsQuery + " GROUP BY ri.product_id").all({ companyId, endDateTime }) as any[];

        // Purchases after endDate
        let purchasesQuery = `
          SELECT pi.product_id, SUM(pi.quantity) as qty
          FROM purchase_items pi
          JOIN purchases p ON p.id = pi.purchase_id
          WHERE p.company_id = @companyId AND p.status = 'completed' AND p.completed_at > @endDateTime
        `;
        const purchasesSince = db.prepare(purchasesQuery + " GROUP BY pi.product_id").all({ companyId, endDateTime }) as any[];

        // Revisions after endDate (Actual - System = Difference. So System = Actual - Difference. Backwards: Stock = Current - Difference)
        let revisionsQuery = `
          SELECT ri.product_id, SUM(ri.difference) as diff
          FROM revision_items ri
          JOIN revisions r ON r.id = ri.revision_id
          WHERE r.company_id = @companyId AND r.status = 'completed' AND r.completed_at > @endDateTime
        `;
        const revisionsSince = db.prepare(revisionsQuery + " GROUP BY ri.product_id").all({ companyId, endDateTime }) as any[];

        // Apply backwards adjustments
        for (const p of products) {
          const sold = salesSince.find(s => s.product_id === p.id)?.qty || 0;
          const returned = returnsSince.find(r => r.product_id === p.id)?.qty || 0;
          const purchased = purchasesSince.find(pr => pr.product_id === p.id)?.qty || 0;
          const revDiff = revisionsSince.find(rv => rv.product_id === p.id)?.diff || 0;

          // Backwards math: Current Stock + Sold - Returned - Purchased - RevisionDifference
          p.current_qty = p.current_qty + sold - returned - purchased - revDiff;
          if (p.current_qty < 0) p.current_qty = 0;
        }
      }

      // Calculate totals
      let totalPurchaseValue = 0;
      let totalRetailValue = 0;
      let totalQuantity = 0;

      const formattedProducts = products.map(p => {
        const qty = parseFloat(p.current_qty) || 0;
        const purchasePrice = parseFloat(p.price_purchase) || 0;
        const retailPrice = parseFloat(p.price_retail) || 0;

        const purchaseValue = qty * purchasePrice;
        const retailValue = qty * retailPrice;

        totalQuantity += qty;
        totalPurchaseValue += purchaseValue;
        totalRetailValue += retailValue;

        return {
          id: p.id,
          name: p.name,
          barcode: p.barcode,
          measure_unit: p.measure_unit,
          category_name: p.category_name,
          quantity: qty,
          price_purchase: purchasePrice,
          price_retail: retailPrice,
          purchase_value: purchaseValue,
          retail_value: retailValue
        };
      }).filter(p => p.quantity > 0); // Hide zero stock

      return {
        success: true,
        data: {
          products: formattedProducts,
          summary: {
            totalQuantity,
            totalPurchaseValue,
            totalRetailValue,
            potentialProfit: totalRetailValue - totalPurchaseValue
          }
        }
      };

    } catch (error: any) {
      log.error('Failed to get valuation report:', error);
      return { success: false, error: 'Ошибка формирования отчета оценки склада' };
    }
  });
}
