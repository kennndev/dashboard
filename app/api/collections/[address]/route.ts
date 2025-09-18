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
    .select('cid, codes, hashes, total_nfts, processed_at, collection_type')
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
    processed_at: data!.processed_at,
    collection_type: data!.collection_type || 'erc721'
  });
}

/* ───────────────────────────────────────────────
   PUT /api/collections/:address
   body → { cid, owner, codes?, hashes?, total_nfts? }
   ───────────────────────────────────────────────*/
export async function PUT(req: NextRequest, { params }: Ctx) {
  const { address } = await params;           // await ⇐ new
  const { cid, owner, codes, hashes, total_nfts, collection_type } = await req.json();

  console.log('PUT /api/collections/[address] - Request data:', { address, cid, owner, codes: codes?.length, hashes: hashes?.length, total_nfts });

  if (!cid || !owner) {
    console.log('PUT /api/collections/[address] - Missing required fields:', { cid: !!cid, owner: !!owner });
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
  if (collection_type) updateData.collection_type = collection_type;
  if (codes || hashes) updateData.processed_at = new Date().toISOString();

  console.log('PUT /api/collections/[address] - Update data:', updateData);

  const { error } = await supabase
    .from('collections')
    .upsert(updateData, { onConflict: 'address' });

  if (error) {
    console.log('PUT /api/collections/[address] - Supabase error:', error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  
  console.log('PUT /api/collections/[address] - Success');
  return NextResponse.json({ ok: true });
}
