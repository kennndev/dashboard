import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

/* shorthand for the context object that Next.js passes */
type Ctx = { params: Promise<{ address: string }> };

/* PUT /api/collections/:address/activate   body → { cid } */
export async function PUT(req: NextRequest, { params }: Ctx) {
  const addrLc = (await params).address.toLowerCase();    // always lowercase
  const { cid } = await req.json();
  if (!cid)
    return NextResponse.json({ error: 'cid missing' }, { status: 400 });

  /* 1️⃣ deactivate any previously active row */
  await supabase
    .from('collections')
    .update({ active: false })
    .eq('active', true);

  /* 2️⃣ row must already exist, so only UPDATE */
  const { error: updErr } = await supabase
    .from('collections')
    .update({ cid, active: true })
    .eq('address', addrLc);

  if (updErr) {
    if (updErr.code === 'PGRST116')        /* no such row (not found) */
      return NextResponse.json({ error: 'collection not found' }, { status: 404 });
    return NextResponse.json({ error: updErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
