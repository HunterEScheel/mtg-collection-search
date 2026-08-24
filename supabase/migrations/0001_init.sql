-- MTG Collection Search: initial schema

create table public.collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.scryfall_cards (
  id uuid primary key,
  name text,
  oracle_text text,
  type_line text,
  mana_cost text,
  cmc numeric,
  colors text[],
  color_identity text[],
  keywords text[],
  rarity text,
  set_code text,
  set_name text,
  power text,
  toughness text,
  loyalty text,
  layout text,
  usd numeric,
  usd_foil numeric,
  image_small text,
  image_normal text,
  scryfall_uri text,
  legalities jsonb,
  data jsonb,
  fetched_at timestamptz default now()
);

create table public.collection_cards (
  id bigint generated always as identity primary key,
  collection_id uuid not null references public.collections(id) on delete cascade,
  scryfall_id uuid not null,
  binder_name text,
  binder_type text,
  card_name text not null,
  set_code text,
  set_name text,
  collector_number text,
  foil text,
  rarity text,
  quantity int not null default 1,
  manabox_id text,
  purchase_price numeric,
  purchase_price_currency text,
  misprint boolean default false,
  altered boolean default false,
  condition text,
  language text,
  added_at timestamptz,
  -- nulls not distinct so upsert matches rows with null binder/condition/language
  unique nulls not distinct (collection_id, scryfall_id, foil, binder_name, condition, language)
);

create index collection_cards_collection_idx on public.collection_cards (collection_id);
create index collection_cards_binder_idx on public.collection_cards (collection_id, binder_name);
create index collection_cards_scryfall_idx on public.collection_cards (scryfall_id);

-- RLS
alter table public.collections enable row level security;
alter table public.collection_cards enable row level security;
alter table public.scryfall_cards enable row level security;

create policy "collections select own" on public.collections
  for select using (auth.uid() = user_id);
create policy "collections insert own" on public.collections
  for insert with check (auth.uid() = user_id);
create policy "collections update own" on public.collections
  for update using (auth.uid() = user_id);
create policy "collections delete own" on public.collections
  for delete using (auth.uid() = user_id);

create policy "collection_cards select own" on public.collection_cards
  for select using (exists (
    select 1 from public.collections c
    where c.id = collection_id and c.user_id = auth.uid()));
create policy "collection_cards insert own" on public.collection_cards
  for insert with check (exists (
    select 1 from public.collections c
    where c.id = collection_id and c.user_id = auth.uid()));
create policy "collection_cards update own" on public.collection_cards
  for update using (exists (
    select 1 from public.collections c
    where c.id = collection_id and c.user_id = auth.uid()));
create policy "collection_cards delete own" on public.collection_cards
  for delete using (exists (
    select 1 from public.collections c
    where c.id = collection_id and c.user_id = auth.uid()));

-- Shared public card cache: any authenticated user can read and warm it.
create policy "scryfall_cards select" on public.scryfall_cards
  for select to authenticated using (true);
create policy "scryfall_cards insert" on public.scryfall_cards
  for insert to authenticated with check (true);
create policy "scryfall_cards update" on public.scryfall_cards
  for update to authenticated using (true);
