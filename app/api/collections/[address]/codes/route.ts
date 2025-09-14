import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseAdmin';

type Ctx = { params: Promise<{ address: string }> };

/* ───────────────────────────────────────────────
   GET /api/collections/:address/codes -> { codes: [] }
   ───────────────────────────────────────────────*/
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { address } = await params;
  const addr = address.toLowerCase();

  const { data, error } = await supabase
    .from('nft_codes')
    .select('*')
    .eq('collection_address', addr)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ codes: data || [] });
}

/* ───────────────────────────────────────────────
   POST /api/collections/:address/codes
   body → { codes: [{ code, hash, token_id?, metadata_uri? }] }
   ───────────────────────────────────────────────*/
export async function POST(req: NextRequest, { params }: Ctx) {
  const { address } = await params;
  const addr = address.toLowerCase();
  const { codes } = await req.json();

  if (!codes || !Array.isArray(codes)) {
    return NextResponse.json({ error: 'codes array is required' }, { status: 400 });
  }

  // Prepare data for insertion
  const codesData = codes.map((codeData: any) => ({
    collection_address: addr,
    code: codeData.code,
    hash: codeData.hash,
    token_id: codeData.token_id || null,
    metadata_uri: codeData.metadata_uri || null,
  }));

  const { error } = await supabase
    .from('nft_codes')
    .insert(codesData);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, inserted: codesData.length });
}

/* ───────────────────────────────────────────────
   DELETE /api/collections/:address/codes
   Delete all codes for a collection
   ───────────────────────────────────────────────*/
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { address } = await params;
  const addr = address.toLowerCase();

  const { error } = await supabase
    .from('nft_codes')
    .delete()
    .eq('collection_address', addr);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
