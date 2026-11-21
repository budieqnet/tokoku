import { NextRequest, NextResponse } from 'next/server';
import { queryOne, query, execute, transaction } from '@/lib/db';
import { authMiddleware } from '@/middleware/auth';
import { z } from 'zod';

const depositSchema = z.object({
  amount: z.number().positive('Jumlah harus lebih dari 0'),
  notes: z.string().optional(),
});

const withdrawSchema = z.object({
  amount: z.number().positive('Jumlah harus lebih dari 0'),
  notes: z.string().optional(),
});

interface Savings {
  id: number;
  user_id: number;
  partner_id: number;
  balance: number;
  created_at: string;
  updated_at: string;
}

interface Transaction {
  id: number;
  user_id: number;
  partner_id: number;
  type: 'deposit' | 'withdraw' | 'payment';
  amount: number;
  balance_before: number;
  balance_after: number;
  reference_type: 'manual' | 'sale';
  reference_id: number | null;
  notes: string | null;
  created_at: string;
}

// GET /api/partners/:id/savings - Get balance and transaction history
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResponse = await authMiddleware(request);
  if (authResponse) return authResponse;

  try {
    const user = (request as any).user;
    const { id } = await params;
    const partnerId = parseInt(id);

    // Verify partner exists and belongs to user
    const partner = await queryOne(
      'SELECT id FROM partners WHERE id = ? AND user_id = ?',
      [partnerId, user.userId]
    );

    if (!partner) {
      return NextResponse.json({ error: 'Mitra tidak ditemukan' }, { status: 404 });
    }

    // Get or create savings record
    let savings = await queryOne<Savings>(
      'SELECT * FROM partner_savings WHERE partner_id = ? AND user_id = ?',
      [partnerId, user.userId]
    );

    if (!savings) {
      // Create savings record if not exists
      const result = await execute(
        'INSERT INTO partner_savings (user_id, partner_id, balance) VALUES (?, ?, 0)',
        [user.userId, partnerId]
      );
      savings = await queryOne<Savings>('SELECT * FROM partner_savings WHERE id = ?', [(result as any).insertId]);
    }

    if (!savings) {
      return NextResponse.json({ error: 'Gagal membuat record tabungan' }, { status: 500 });
    }

    // Get transaction history
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    const total = await queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM partner_savings_transactions WHERE partner_id = ? AND user_id = ?',
      [partnerId, user.userId]
    );

    const transactions = await query<Transaction>(
      `SELECT * FROM partner_savings_transactions 
       WHERE partner_id = ? AND user_id = ? 
       ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [partnerId, user.userId, limit, offset]
    );

    return NextResponse.json({
      savings: {
        id: savings.id,
        partner_id: savings.partner_id,
        balance: Number(savings.balance),
        created_at: savings.created_at,
        updated_at: savings.updated_at,
      },
      transactions: transactions.map(t => ({
        ...t,
        amount: Number(t.amount),
        balance_before: Number(t.balance_before),
        balance_after: Number(t.balance_after),
      })),
      pagination: {
        page,
        limit,
        total: total?.count || 0,
        totalPages: Math.ceil((total?.count || 0) / limit),
      },
    });
  } catch (error) {
    console.error('Get partner savings error:', error);
    return NextResponse.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// POST /api/partners/:id/savings/deposit - Deposit to savings
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResponse = await authMiddleware(request);
  if (authResponse) return authResponse;

  try {
    const user = (request as any).user;
    const { id } = await params;
    const partnerId = parseInt(id);
    const body = await request.json();
    const parsed = depositSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validasi gagal', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { amount, notes } = parsed.data;

    // Verify partner exists
    const partner = await queryOne(
      'SELECT id FROM partners WHERE id = ? AND user_id = ?',
      [partnerId, user.userId]
    );

    if (!partner) {
      return NextResponse.json({ error: 'Mitra tidak ditemukan' }, { status: 404 });
    }

    const result = await transaction(async (conn) => {
      // Get or create savings
      let savings = await queryOne<Savings>(
        'SELECT * FROM partner_savings WHERE partner_id = ? AND user_id = ? FOR UPDATE',
        [partnerId, user.userId]
      );

      if (!savings) {
        const [insertResult] = await conn.execute(
          'INSERT INTO partner_savings (user_id, partner_id, balance) VALUES (?, ?, 0)',
          [user.userId, partnerId]
        );
        savings = await queryOne<Savings>('SELECT * FROM partner_savings WHERE id = ?', [(insertResult as any).insertId]);
      }

      if (!savings) {
        throw new Error('Gagal membuat record tabungan');
      }

      const balanceBefore = Number(savings.balance);
      const balanceAfter = balanceBefore + amount;

      // Update balance
      await conn.execute(
        'UPDATE partner_savings SET balance = ? WHERE id = ?',
        [balanceAfter, savings.id]
      );

      // Record transaction
      await conn.execute(
        `INSERT INTO partner_savings_transactions 
         (user_id, partner_id, type, amount, balance_before, balance_after, reference_type, notes) 
         VALUES (?, ?, 'deposit', ?, ?, ?, 'manual', ?)`,
        [user.userId, partnerId, amount, balanceBefore, balanceAfter, notes || null]
      );

      return { balanceAfter };
    });

    return NextResponse.json({
      message: 'Setoran berhasil',
      balance: result.balanceAfter,
    }, { status: 201 });
  } catch (error) {
    console.error('Deposit savings error:', error);
    return NextResponse.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// PUT /api/partners/:id/savings - Withdraw from savings
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResponse = await authMiddleware(request);
  if (authResponse) return authResponse;

  try {
    const user = (request as any).user;
    const { id } = await params;
    const partnerId = parseInt(id);
    const body = await request.json();
    const parsed = withdrawSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validasi gagal', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { amount, notes } = parsed.data;

    // Verify partner exists
    const partner = await queryOne(
      'SELECT id FROM partners WHERE id = ? AND user_id = ?',
      [partnerId, user.userId]
    );

    if (!partner) {
      return NextResponse.json({ error: 'Mitra tidak ditemukan' }, { status: 404 });
    }

    const result = await transaction(async (conn) => {
      // Get savings with lock
      let savings = await queryOne<Savings>(
        'SELECT * FROM partner_savings WHERE partner_id = ? AND user_id = ? FOR UPDATE',
        [partnerId, user.userId]
      );

      if (!savings) {
        throw new Error('Tabungan tidak ditemukan');
      }

      const balanceBefore = Number(savings.balance);
      
      if (balanceBefore < amount) {
        throw new Error('Saldo tidak mencukupi');
      }

      const balanceAfter = balanceBefore - amount;

      // Update balance
      await conn.execute(
        'UPDATE partner_savings SET balance = ? WHERE id = ?',
        [balanceAfter, savings.id]
      );

      // Record transaction
      await conn.execute(
        `INSERT INTO partner_savings_transactions 
         (user_id, partner_id, type, amount, balance_before, balance_after, reference_type, notes) 
         VALUES (?, ?, 'withdraw', ?, ?, ?, 'manual', ?)`,
        [user.userId, partnerId, amount, balanceBefore, balanceAfter, notes || null]
      );

      return { balanceAfter };
    });

    return NextResponse.json({
      message: 'Penarikan berhasil',
      balance: result.balanceAfter,
    });
  } catch (error: any) {
    console.error('Withdraw savings error:', error);
    const message = error.message === 'Saldo tidak mencukupi' || error.message === 'Tabungan tidak ditemukan'
      ? error.message
      : 'Terjadi kesalahan server';
    return NextResponse.json({ error: message }, { status: error.message === 'Saldo tidak mencukupi' ? 400 : 500 });
  }
}