import { supabase } from '@/lib/supabaseAdmin';
import { NextResponse, NextRequest } from 'next/server';

// helper to avoid repeating the long type
type Ctx = { params: Promise<{ address: string }> };

/* ───────────────────────────────────────────────
   GET /api/collections/:address  -> { cid, codes, hashes, total_nfts } | 404
   ───────────────────────────────────────────────*/
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { address } = await params;           // await ⇐ new
  const addr = address.toLowerCase();

  const { data, error } = await supabase
    .from('collections')
    .select('cid, codes, hashes, total_nfts, processed_at')
    .eq('address', addr)
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: error.code === 'PGRST116' ? 404 : 400 },
    );
  }
  return NextResponse.json({ 
    cid: data!.cid,
    codes: data!.codes || [],
    hashes: data!.hashes || [],
    total_nfts: data!.total_nfts || 0,
    processed_at: data!.processed_at
  });
}

/* ───────────────────────────────────────────────
   PUT /api/collections/:address
   body → { cid, owner, codes?, hashes?, total_nfts? }
   ───────────────────────────────────────────────*/
export async function PUT(req: NextRequest, { params }: Ctx) {
  const { address } = await params;           // await ⇐ new
  const { cid, owner, codes, hashes, total_nfts } = await req.json();

  if (!cid || !owner) {
    return NextResponse.json({ error: 'cid or owner missing' }, { status: 400 });
  }

  const updateData: any = {
    address : address.toLowerCase(),
    cid,
    owner   : owner.toLowerCase(),
  };

  // Add optional fields if provided
  if (codes) updateData.codes = codes;
  if (hashes) updateData.hashes = hashes;
  if (total_nfts !== undefined) updateData.total_nfts = total_nfts;
  if (codes || hashes) updateData.processed_at = new Date().toISOString();

  const { error } = await supabase
    .from('collections')
    .upsert(updateData, { onConflict: 'address' });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
