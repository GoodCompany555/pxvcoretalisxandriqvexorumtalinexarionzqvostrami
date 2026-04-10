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
        SELECT COUNT(*) as count FROM products p
        JOIN inventory i ON p.id = i.product_id AND i.company_id = p.company_id
        WHERE p.company_id = ? AND i.quantity <= 5 AND i.quantity > 0
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
}
