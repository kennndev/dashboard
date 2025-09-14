import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseAdmin'

export async function POST(req: Request) {
  const { address, owner } = await req.json()          // {0x…, 0x…}

  const { error } = await supabase.from('collections').upsert({
    address: address.toLowerCase(),
    owner  : owner.toLowerCase(),
  })

  if (error) return NextResponse.json({ error }, { status: 400 })
  return NextResponse.json({ ok: true })
}
