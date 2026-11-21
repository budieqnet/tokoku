import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { authMiddleware } from '@/middleware/auth';
import * as XLSX from 'xlsx';

interface Sale {
  id: number;
  product_id: number | null;
  product_name: string;
  sku: string | null;
  qty: number;
  price: number;
  subtotal: number;
  customer_id: number | null;
  customer_name: string | null;
  customer_type: string;
  partner_id: number | null;
  sale_date: string;
  notes: string | null;
  payment_method: string;
  created_at: string;
  updated_at: string;
}

interface Purchase {
  id: number;
  product_id: number | null;
  product_name: string;
  sku: string | null;
  qty: number;
  price: number;
  supplier_id: number | null;
  supplier_name: string | null;
  customer_id: number | null;
  customer_name: string | null;
  purchase_date: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface OperationalCost {
  id: number;
  category_name: string;
  amount: number;
  cost_date: string;
  notes: string | null;
  created_at: string;
}

export async function GET(request: NextRequest) {
  const authResponse = await authMiddleware(request);
  if (authResponse) return authResponse;

  try {
    const user = (request as any).user;
    const { searchParams } = new URL(request.url);

    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');
    const exportFormat = searchParams.get('export'); // 'xlsx' or 'csv'

    let whereClause = 'WHERE user_id = ?';
    const params: any[] = [user.userId];

    if (dateFrom) {
      whereClause += ' AND sale_date >= ?';
      params.push(dateFrom);
    }
    if (dateTo) {
      whereClause += ' AND sale_date <= ?';
      params.push(dateTo);
    }

    // Fetch sales
    const sales = await query<Sale>(
      `SELECT * FROM sales ${whereClause} ORDER BY sale_date DESC`,
      params
    );

    // Fetch purchases with same date filter
    let purchaseWhereClause = 'WHERE user_id = ?';
    const purchaseParams: any[] = [user.userId];

    if (dateFrom) {
      purchaseWhereClause += ' AND purchase_date >= ?';
      purchaseParams.push(dateFrom);
    }
    if (dateTo) {
      purchaseWhereClause += ' AND purchase_date <= ?';
      purchaseParams.push(dateTo);
    }

    const purchases = await query<Purchase>(
      `SELECT * FROM purchases ${purchaseWhereClause} ORDER BY purchase_date DESC`,
      purchaseParams
    );

    // Fetch operational costs with same date filter
    let costWhereClause = 'WHERE user_id = ?';
    const costParams: any[] = [user.userId];

    if (dateFrom) {
      costWhereClause += ' AND cost_date >= ?';
      costParams.push(dateFrom);
    }
    if (dateTo) {
      costWhereClause += ' AND cost_date <= ?';
      costParams.push(dateTo);
    }

    const costs = await query<OperationalCost>(
      `SELECT oc.*, ec.name AS category_name
       FROM operational_costs oc
       LEFT JOIN expense_categories ec ON oc.category_id = ec.id
       ${costWhereClause}
       ORDER BY oc.cost_date DESC`,
      costParams
    );

    // Calculate summary
    const totalSales = sales.reduce((sum: number, s) => sum + Number(s.subtotal), 0);
    const totalPurchases = purchases.reduce((sum: number, p) => sum + (Number(p.price) * Number(p.qty)), 0);
    const totalOperationalCosts = costs.reduce((sum: number, c) => sum + Number(c.amount), 0);
    const netProfit = totalSales - totalPurchases - totalOperationalCosts;
    const totalTransactions = sales.length + purchases.length + costs.length;

    // If export requested, generate file
    if (exportFormat === 'xlsx' || exportFormat === 'csv') {
      return generateExport(sales, purchases, costs, exportFormat, dateFrom, dateTo);
    }

    // Combine transactions for display
    const allTransactions = [
      ...sales.map(s => ({
        id: s.id,
        date: s.sale_date,
        type: 'penjualan' as const,
        product: s.product_name,
        qty: s.qty,
        total: Number(s.subtotal),
      })),
      ...purchases.map(p => ({
        id: p.id,
        date: p.purchase_date,
        type: 'pembelian' as const,
        product: p.product_name,
        qty: p.qty,
        total: Number(p.price) * Number(p.qty),
      })),
      ...costs.map(c => ({
        id: c.id,
        date: c.cost_date,
        type: 'biaya operasional' as const,
        product: c.category_name,
        qty: 1,
        total: Number(c.amount),
      })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return NextResponse.json({
      summary: {
        totalSales,
        totalPurchases,
        totalOperationalCosts,
        netProfit,
        totalTransactions,
      },
      transactions: allTransactions,
    });
  } catch (error) {
    console.error('Finance report error:', error);
    return NextResponse.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

function generateExport(sales: Sale[], purchases: Purchase[], costs: OperationalCost[], format: 'xlsx' | 'csv', dateFrom: string | null, dateTo: string | null) {
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    });
  };

  // Prepare data for export
  const salesData = sales.map((s, index) => ({
    No: index + 1,
    Tanggal: formatDate(s.sale_date),
    Jenis: 'Penjualan',
    Produk: s.product_name,
    SKU: s.sku || '-',
    Qty: s.qty,
    Harga: Number(s.price),
    Subtotal: Number(s.subtotal),
    Pelanggan: s.customer_name || (s.customer_type === 'mitra' ? 'Mitra' : s.customer_type === 'pelanggan' ? 'Pelanggan' : 'Umum'),
    'Tipe Pelanggan': s.customer_type === 'mitra' ? 'Mitra' : s.customer_type === 'pelanggan' ? 'Pelanggan' : 'Umum',
    'Metode Bayar': s.payment_method === 'cash' ? 'Tunai' : s.payment_method === 'transfer' ? 'Transfer' : 'Tabungan Mitra',
    Catatan: s.notes || '-',
    'Dibuat': formatDate(s.created_at),
  }));

  const purchasesData = purchases.map((p, index) => ({
    No: index + 1,
    Tanggal: formatDate(p.purchase_date),
    Jenis: 'Pembelian',
    Produk: p.product_name,
    SKU: p.sku || '-',
    Qty: p.qty,
    Harga: Number(p.price),
    Subtotal: Number(p.price) * Number(p.qty),
    Supplier: p.supplier_name || '-',
    Catatan: p.notes || '-',
    'Dibuat': formatDate(p.created_at),
  }));

  const costsData = costs.map((c, index) => ({
    No: index + 1,
    Tanggal: formatDate(c.cost_date),
    Jenis: 'Biaya Operasional',
    Produk: c.category_name,
    SKU: '-',
    Qty: 1,
    Harga: Number(c.amount),
    Subtotal: Number(c.amount),
    Pelanggan: '-',
    'Tipe Pelanggan': '-',
    'Metode Bayar': '-',
    Catatan: c.notes || '-',
    'Dibuat': formatDate(c.created_at),
    Supplier: '-',
  }));

  const allData = [...salesData, ...purchasesData, ...costsData].sort((a, b) =>
    new Date(b.Tanggal.split('/').reverse().join('-')).getTime() - new Date(a.Tanggal.split('/').reverse().join('-')).getTime()
  );

  // Add summary rows
  const totalSales = sales.reduce((sum: number, s) => sum + Number(s.subtotal), 0);
  const totalPurchases = purchases.reduce((sum: number, p) => sum + (Number(p.price) * Number(p.qty)), 0);
  const totalOperationalCosts = costs.reduce((sum: number, c) => sum + Number(c.amount), 0);
  const netProfit = totalSales - totalPurchases - totalOperationalCosts;

  const summaryRows = [
    { Tanggal: '', Jenis: '', Produk: '', SKU: '', Qty: '', Harga: '', Subtotal: totalSales, Pelanggan: '', 'Tipe Pelanggan': '', 'Metode Bayar': '', Catatan: '', Dibuat: '', Supplier: '' },
    { Tanggal: '', Jenis: '', Produk: '', SKU: '', Qty: '', Harga: '', Subtotal: totalPurchases, Pelanggan: '', 'Tipe Pelanggan': '', 'Metode Bayar': '', Catatan: '', Dibuat: '', Supplier: '' },
    { Tanggal: '', Jenis: '', Produk: '', SKU: '', Qty: '', Harga: '', Subtotal: totalOperationalCosts, Pelanggan: '', 'Tipe Pelanggan': '', 'Metode Bayar': '', Catatan: '', Dibuat: '', Supplier: '' },
    { Tanggal: '', Jenis: '', Produk: '', SKU: '', Qty: '', Harga: '', Subtotal: netProfit, Pelanggan: '', 'Tipe Pelanggan': '', 'Metode Bayar': '', Catatan: '', Dibuat: '', Supplier: '' },
  ];

  const exportData = [...allData, ...summaryRows];

  if (format === 'csv') {
    // Generate CSV
    const csv = XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(exportData));
    const filename = `laporan-keuangan-${dateFrom || 'all'}-${dateTo || 'all'}-${new Date().toISOString().split('T')[0]}.csv`;

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  }

  // Generate XLSX
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(exportData);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Laporan Keuangan');
  const xlsxBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
  const filename = `laporan-keuangan-${dateFrom || 'all'}-${dateTo || 'all'}-${new Date().toISOString().split('T')[0]}.xlsx`;

  return new NextResponse(xlsxBuffer as unknown as Blob, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
