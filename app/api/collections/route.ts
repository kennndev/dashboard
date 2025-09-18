import { NextResponse, NextRequest } from 'next/server'
import { supabase } from '@/lib/supabaseAdmin'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const owner = searchParams.get('owner')
  
  if (!owner) {
    return NextResponse.json({ error: 'owner parameter is required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('collections')
    .select('*')
    .eq('owner', owner.toLowerCase())
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json(data || [])
}

export async function POST(req: Request) {
  const { address, owner, collection_type } = await req.json()          // {0x…, 0x…, 'erc721'|'erc1155'}

  const { error } = await supabase.from('collections').upsert({
    address: address.toLowerCase(),
    owner  : owner.toLowerCase(),
    collection_type: collection_type || 'erc721', // Default to erc721 for backward compatibility
  })

  if (error) return NextResponse.json({ error }, { status: 400 })
  return NextResponse.json({ ok: true })
}
