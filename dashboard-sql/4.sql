-- Add codes storage to collections table
-- This migration adds support for storing generated codes and related data

-- 1. Add new columns to collections table for codes and metadata
alter table public.collections add column if not exists codes jsonb;
alter table public.collections add column if not exists hashes jsonb;
alter table public.collections add column if not exists total_nfts integer default 0;
alter table public.collections add column if not exists processed_at timestamptz;

-- 2. Create a separate table for individual NFT codes (optional, for more detailed tracking)
create table if not exists public.nft_codes (
  id          bigserial primary key,
  collection_address text not null references public.collections(address) on delete cascade,
  code        text not null,
  hash        text not null,
  token_id    integer,
  metadata_uri text,
  created_at  timestamptz default now(),
  unique(collection_address, code)
);

-- 3. Enable RLS on nft_codes table
alter table public.nft_codes enable row level security;

-- 4. Create policies for nft_codes table
create policy nft_codes_read
  on public.nft_codes
  for select
  using (true);

create policy nft_codes_write
  on public.nft_codes
  for all
  using (true)
  with check (true);

-- 5. Create indexes for better performance
create index if not exists idx_nft_codes_collection on public.nft_codes(collection_address);
create index if not exists idx_nft_codes_code on public.nft_codes(code);
create index if not exists idx_collections_codes on public.collections using gin(codes);
create index if not exists idx_collections_hashes on public.collections using gin(hashes);

-- 6. Add comments for documentation
comment on column public.collections.codes is 'JSON array of generated codes for this collection';
comment on column public.collections.hashes is 'JSON array of corresponding hashes for the codes';
comment on column public.collections.total_nfts is 'Total number of NFTs in this collection';
comment on column public.collections.processed_at is 'Timestamp when the collection was processed with codes';
comment on table public.nft_codes is 'Individual NFT codes and their metadata for detailed tracking';
