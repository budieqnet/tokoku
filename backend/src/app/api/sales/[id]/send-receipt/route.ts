import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { authMiddleware } from '@/middleware/auth';
import { sendReceiptNotifications } from '@/lib/notifications';

interface SaleWithDetails {
  id: number;
  user_id: number;
  product_id: number | null;
  package_id: number | null;
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
  partner_name?: string;
  partner_phone?: string;
  partner_email?: string;
  customer_phone?: string;
  customer_email?: string;
  items?: Array<{ product_name: string; qty: number }>;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResponse = await authMiddleware(request);
  if (authResponse) return authResponse;

  try {
    const user = (request as any).user;
    const { id } = await params;
    const saleId = parseInt(id);
    const body = await request.json();
    const { channels } = body; // { email: true, sms: true, whatsapp: true }

    // Get sale with related data
    const sale = await queryOne<SaleWithDetails>(
      `SELECT s.*, 
        p.name as partner_name, p.phone as partner_phone, p.email as partner_email,
        c.phone as customer_phone, c.email as customer_email
      FROM sales s
      LEFT JOIN partners p ON s.partner_id = p.id AND s.user_id = p.user_id
      LEFT JOIN customers c ON s.customer_id = c.id AND s.user_id = c.user_id
      WHERE s.id = ? AND s.user_id = ?`,
      [saleId, user.userId]
    );

    if (!sale) {
      return NextResponse.json({ error: 'Penjualan tidak ditemukan' }, { status: 404 });
    }

    if (sale.package_id) {
      const items = await query<{ product_name: string; qty: number | string }>(
        'SELECT product_name, qty FROM sale_items WHERE sale_id = ? ORDER BY id',
        [saleId]
      );
      sale.items = items.map((item) => ({
        product_name: item.product_name,
        qty: Number(item.qty),
      }));
    }

    // Generate receipt HTML and text (reuse logic from receipt endpoint)
    const receiptHtml = generateReceiptHtml(sale);
    const receiptText = generateReceiptText(sale);

    // Prepare receipt data for notifications
    const receiptData = {
      saleId: sale.id,
      receiptHtml,
      receiptText,
      customerName: sale.customer_name || undefined,
      customerPhone: sale.customer_phone || undefined,
      customerEmail: sale.customer_email || undefined,
      partnerName: sale.partner_name || undefined,
      partnerPhone: sale.partner_phone || undefined,
      partnerEmail: sale.partner_email || undefined,
    };

    // Send notifications based on requested channels
    const results = {
      email: { success: false, error: 'Not requested' },
      sms: { success: false, error: 'Not requested' },
      whatsapp: { success: false, error: 'Not requested' },
    };

    if (channels?.email) {
      const { sendReceiptNotifications } = await import('@/lib/notifications');
      const notificationResults = await sendReceiptNotifications({
        ...receiptData,
        // Only send email if requested
      });
      results.email = notificationResults.email;
    }

    if (channels?.sms) {
      const { sendReceiptNotifications } = await import('@/lib/notifications');
      const notificationResults = await sendReceiptNotifications({
        ...receiptData,
      });
      results.sms = notificationResults.sms;
    }

    if (channels?.whatsapp) {
      const { sendReceiptNotifications } = await import('@/lib/notifications');
      const notificationResults = await sendReceiptNotifications({
        ...receiptData,
      });
      results.whatsapp = notificationResults.whatsapp;
    }

    return NextResponse.json({
      message: 'Struk berhasil dikirim',
      results,
    });
  } catch (error) {
    console.error('Send receipt error:', error);
    return NextResponse.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

function generateReceiptHtml(sale: SaleWithDetails): string {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  const paymentMethodLabels: Record<string, string> = {
    cash: 'Tunai',
    transfer: 'Transfer',
    partner_savings: 'Tabungan Mitra',
  };

  const customerTypeLabels: Record<string, string> = {
    pelanggan: 'Pelanggan Terdaftar',
    mitra: 'Mitra',
    umum: 'Umum',
  };

  return `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Struk Penjualan #${sale.id}</title>
  <style>
    body { font-family: 'Courier New', monospace; margin: 0; padding: 20px; background: #f5f5f5; }
    .receipt { max-width: 400px; margin: 0 auto; background: white; padding: 20px; border: 1px solid #ddd; }
    .header { text-align: center; border-bottom: 2px dashed #333; padding-bottom: 10px; margin-bottom: 15px; }
    .shop-name { font-size: 18px; font-weight: bold; margin-bottom: 5px; }
    .shop-info { font-size: 11px; color: #666; }
    .receipt-title { font-size: 14px; font-weight: bold; text-align: center; margin: 15px 0; text-decoration: underline; }
    .info-row { display: flex; justify-content: space-between; font-size: 12px; margin: 5px 0; }
    .info-label { color: #666; }
    .info-value { font-weight: bold; }
    .divider { border-top: 1px dashed #999; margin: 10px 0; }
    .items { margin: 10px 0; }
    .item { font-size: 12px; margin-bottom: 8px; }
    .item-name { font-weight: bold; }
    .item-details { display: flex; justify-content: space-between; color: #666; }
    .totals { border-top: 2px dashed #333; padding-top: 10px; margin-top: 10px; }
    .total-row { display: flex; justify-content: space-between; font-size: 12px; margin: 5px 0; }
    .total-label { color: #666; }
    .total-value { font-weight: bold; }
    .grand-total { font-size: 14px; border-top: 1px solid #333; padding-top: 5px; }
    .payment-info { margin-top: 15px; font-size: 11px; color: #666; }
    .footer { text-align: center; margin-top: 20px; font-size: 11px; color: #999; border-top: 1px dashed #999; padding-top: 10px; }
    @media print { body { background: none; padding: 0; } .receipt { border: none; max-width: none; } }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="header">
      <div class="shop-name">TOKOKU</div>
      <div class="shop-info">Sistem Manajemen Toko</div>
      <div class="shop-info">Tanggal: ${formatDate(sale.created_at)}</div>
    </div>

    <div class="receipt-title">STRUK PENJUALAN #${sale.id}</div>

    <div class="info-row">
      <span class="info-label">Tanggal Transaksi:</span>
      <span class="info-value">${formatDate(sale.sale_date)}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Tipe Pelanggan:</span>
      <span class="info-value">${customerTypeLabels[sale.customer_type] || sale.customer_type}</span>
    </div>
    ${sale.customer_name ? `
    <div class="info-row">
      <span class="info-label">Pelanggan:</span>
      <span class="info-value">${sale.customer_name}</span>
    </div>
    ` : ''}
    ${sale.partner_name ? `
    <div class="info-row">
      <span class="info-label">Mitra:</span>
      <span class="info-value">${sale.partner_name}</span>
    </div>
    ` : ''}
    <div class="info-row">
      <span class="info-label">Metode Bayar:</span>
      <span class="info-value">${paymentMethodLabels[sale.payment_method] || sale.payment_method}</span>
    </div>

    <div class="divider"></div>

    <div class="items">
      <div class="item">
        <div class="item-name">${sale.product_name}</div>
        ${sale.items?.length ? `<div class="item-details"><span>Isi: ${sale.items.map((item) => `${item.qty}× ${item.product_name}`).join(', ')}</span></div>` : ''}
        ${sale.sku ? `<div class="item-details"><span>SKU: ${sale.sku}</span></div>` : ''}
        <div class="item-details">
          <span>${sale.qty} x ${formatCurrency(sale.price)}</span>
          <span>${formatCurrency(sale.subtotal)}</span>
        </div>
      </div>
    </div>

    <div class="divider"></div>

    <div class="totals">
      <div class="total-row">
        <span class="total-label">Subtotal</span>
        <span class="total-value">${formatCurrency(sale.subtotal)}</span>
      </div>
      <div class="total-row grand-total">
        <span class="total-label">TOTAL</span>
        <span class="total-value">${formatCurrency(sale.subtotal)}</span>
      </div>
    </div>

    <div class="payment-info">
      <strong>Metode Pembayaran:</strong> ${paymentMethodLabels[sale.payment_method] || sale.payment_method}<br>
      ${sale.payment_method === 'partner_savings' && sale.partner_name ? `Dibayar dari tabungan: ${sale.partner_name}` : ''}
      ${sale.notes ? `<br><strong>Catatan:</strong> ${sale.notes}` : ''}
    </div>

    <div class="footer">
      Terima kasih telah berbelanja!<br>
      Struk ini dicetak otomatis oleh sistem TOKOKU<br>
      ${new Date().toLocaleString('id-ID')}
    </div>
  </div>
</body>
</html>
  `.trim();
}

function generateReceiptText(sale: SaleWithDetails): string {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  const paymentMethodLabels: Record<string, string> = {
    cash: 'Tunai',
    transfer: 'Transfer',
    partner_savings: 'Tabungan Mitra',
  };

  const customerTypeLabels: Record<string, string> = {
    pelanggan: 'Pelanggan Terdaftar',
    mitra: 'Mitra',
    umum: 'Umum',
  };

  let text = '';
  text += '================================\n';
  text += '           TOKOKU\n';
  text += '    Sistem Manajemen Toko\n';
  text += '================================\n\n';
  text += `       STRUK PENJUALAN #${sale.id}\n\n`;
  text += `Tanggal: ${formatDate(sale.created_at)}\n`;
  text += `Transaksi: ${formatDate(sale.sale_date)}\n`;
  text += `Tipe: ${customerTypeLabels[sale.customer_type] || sale.customer_type}\n`;
  if (sale.customer_name) text += `Pelanggan: ${sale.customer_name}\n`;
  if (sale.partner_name) text += `Mitra: ${sale.partner_name}\n`;
  text += `Bayar: ${paymentMethodLabels[sale.payment_method] || sale.payment_method}\n`;
  text += '--------------------------------\n';
  text += `${sale.product_name}\n`;
  if (sale.items?.length) {
    text += `Isi: ${sale.items.map((item) => `${item.qty}x ${item.product_name}`).join(', ')}\n`;
  }
  if (sale.sku) text += `SKU: ${sale.sku}\n`;
  text += `${sale.qty} x ${formatCurrency(sale.price)} = ${formatCurrency(sale.subtotal)}\n`;
  text += '--------------------------------\n';
  text += `TOTAL: ${formatCurrency(sale.subtotal)}\n`;
  text += '--------------------------------\n';
  text += `Bayar: ${paymentMethodLabels[sale.payment_method] || sale.payment_method}\n`;
  if (sale.payment_method === 'partner_savings' && sale.partner_name) {
    text += `Dari tabungan: ${sale.partner_name}\n`;
  }
  if (sale.notes) text += `Catatan: ${sale.notes}\n`;
  text += '\n================================\n';
  text += '  Terima kasih telah berbelanja!\n';
  text += 'Struk ini dicetak otomatis oleh\n';
  text += 'sistem TOKOKU\n';
  text += new Date().toLocaleString('id-ID');
  text += '\n================================\n';

  return text;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('id-ID', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

const paymentMethodLabels: Record<string, string> = {
  cash: 'Tunai',
  transfer: 'Transfer',
  partner_savings: 'Tabungan Mitra',
};

const customerTypeLabels: Record<string, string> = {
  pelanggan: 'Pelanggan Terdaftar',
  mitra: 'Mitra',
  umum: 'Umum',
};