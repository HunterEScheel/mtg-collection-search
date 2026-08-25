-- For-sale locations and reservations.
--
-- A shared location can be flagged for_sale. Anyone viewing its share link can
-- reserve a selection of cards: a security-definer RPC moves the selected
-- copies into a new location owned by the SELLER, auto-shared with a fresh
-- GUID so the buyer can always reach it by link. If the buyer was signed in,
-- reserved_by records them and RLS lets them see the location in their own
-- app too (read-only — all write policies remain owner-only).

alter table public.collections
  add column for_sale boolean not null default false,
  add column reserved_by uuid references auth.users(id) on delete set null,
  add column reserved_from uuid references public.collections(id) on delete set null;

-- Buyers can see locations reserved for them (and their cards). Read-only:
-- insert/update/delete policies still check user_id = auth.uid().
create policy "collections select reserved for me" on public.collections
  for select using (reserved_by = auth.uid());
create policy "collection_cards select reserved for me" on public.collection_cards
  for select using (exists (
    select 1 from public.collections c
    where c.id = collection_id and c.reserved_by = auth.uid()));

-- Shared view now needs to know whether the location is for sale / a reservation.
create or replace function public.get_shared_location(p_share_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'name', c.name,
    'for_sale', c.for_sale,
    'reserved', c.reserved_from is not null,
    'cards', coalesce(
      (
        select jsonb_agg(
          to_jsonb(cc) || jsonb_build_object(
            'scryfall',
            (select to_jsonb(s) - 'data' from public.scryfall_cards s where s.id = cc.scryfall_id)
          )
          order by cc.id
        )
        from public.collection_cards cc
        where cc.collection_id = c.id
      ),
      '[]'::jsonb
    )
  )
  from public.collections c
  where c.share_id = p_share_id;
$$;

revoke all on function public.get_shared_location(uuid) from public;
grant execute on function public.get_shared_location(uuid) to anon, authenticated;

-- Reserve a selection from a for-sale shared location.
-- p_items: [{"id": <collection_cards.id>, "quantity": <copies wanted>}, ...]
-- Moves min(wanted, available) copies per row into a new, auto-shared location
-- owned by the seller. Runs in one transaction; any error rolls everything back.
create or replace function public.reserve_cards(
  p_share_id uuid,
  p_items jsonb,
  p_buyer_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  src public.collections%rowtype;
  new_loc public.collections%rowtype;
  item jsonb;
  card public.collection_cards%rowtype;
  take int;
  moved int := 0;
begin
  select * into src from public.collections where share_id = p_share_id and for_sale;
  if not found then
    raise exception 'This location is not open for reservations';
  end if;
  if p_buyer_name is null or btrim(p_buyer_name) = '' then
    raise exception 'A name is required to reserve cards';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'No cards selected';
  end if;

  insert into public.collections (user_id, name, share_id, reserved_by, reserved_from)
  values (
    src.user_id,
    'Reserved for ' || btrim(p_buyer_name) || ' (' || to_char(now(), 'YYYY-MM-DD') || ')',
    gen_random_uuid(),
    auth.uid(),
    src.id
  )
  returning * into new_loc;

  for item in select * from jsonb_array_elements(p_items) loop
    select * into card
    from public.collection_cards
    where id = (item->>'id')::bigint and collection_id = src.id
    for update;
    if not found then
      raise exception 'A selected card is no longer available';
    end if;

    take := least(greatest(coalesce((item->>'quantity')::int, 0), 0), card.quantity);
    if take <= 0 then
      continue;
    end if;

    insert into public.collection_cards (
      collection_id, scryfall_id, binder_name, binder_type, card_name,
      set_code, set_name, collector_number, foil, rarity, quantity,
      manabox_id, purchase_price, purchase_price_currency, misprint,
      altered, condition, language, added_at
    )
    values (
      new_loc.id, card.scryfall_id, card.binder_name, card.binder_type, card.card_name,
      card.set_code, card.set_name, card.collector_number, card.foil, card.rarity, take,
      card.manabox_id, card.purchase_price, card.purchase_price_currency, card.misprint,
      card.altered, card.condition, card.language, card.added_at
    )
    on conflict (collection_id, scryfall_id, foil, binder_name, condition, language)
    do update set quantity = public.collection_cards.quantity + excluded.quantity;

    if take >= card.quantity then
      delete from public.collection_cards where id = card.id;
    else
      update public.collection_cards set quantity = quantity - take where id = card.id;
    end if;

    moved := moved + take;
  end loop;

  if moved = 0 then
    raise exception 'No cards selected';
  end if;

  return jsonb_build_object(
    'location_id', new_loc.id,
    'share_id', new_loc.share_id,
    'name', new_loc.name,
    'moved', moved
  );
end;
$$;

revoke all on function public.reserve_cards(uuid, jsonb, text) from public;
grant execute on function public.reserve_cards(uuid, jsonb, text) to anon, authenticated;

-- Hand a reservation over to the buyer. The seller owns the reserved location
-- until they transfer; afterwards the location belongs entirely to the buyer
-- and the seller is no longer tied to it in any way. Requires the buyer to
-- have been signed in when reserving (reserved_by set) — otherwise there is
-- no account to transfer to.
create or replace function public.transfer_location(p_location_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.collections
  set user_id = reserved_by,
      reserved_by = null,
      reserved_from = null,
      for_sale = false
  where id = p_location_id
    and user_id = auth.uid()
    and reserved_by is not null;
  if not found then
    raise exception 'Cannot transfer: not your location, or the buyer was not signed in when reserving';
  end if;
end;
$$;

revoke all on function public.transfer_location(uuid) from public;
grant execute on function public.transfer_location(uuid) to authenticated;
