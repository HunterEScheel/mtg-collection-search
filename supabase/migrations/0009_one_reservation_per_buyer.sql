-- One reserve list per buyer per for-sale location. Reserving again appends
-- to the buyer's existing reservation (same location, same share link)
-- instead of creating a new one — which also closes the raw-API griefing
-- vector of spamming unlimited reservation locations under the seller's
-- account. Identity remains server-derived (auth.uid() / JWT email), so a
-- reservation can never be made on another user's behalf.

create or replace function public.reserve_cards(
  p_share_id uuid,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  src public.collections%rowtype;
  target public.collections%rowtype;
  buyer_email text;
  item jsonb;
  card public.collection_cards%rowtype;
  wanted int;
  take int;
  moved int := 0;
  conflicts jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sign in to reserve cards';
  end if;
  buyer_email := coalesce(auth.jwt() ->> 'email', 'buyer');

  select * into src from public.collections where share_id = p_share_id and for_sale;
  if not found then
    raise exception 'This location is not open for reservations';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'No cards selected';
  end if;

  -- Pass 1: lock and validate every requested row. Collect conflicts.
  for item in select * from jsonb_array_elements(p_items) loop
    wanted := greatest(coalesce((item->>'quantity')::int, 0), 0);
    if wanted <= 0 then
      continue;
    end if;

    select * into card
    from public.collection_cards
    where id = (item->>'id')::bigint and collection_id = src.id
    for update;

    if not found then
      conflicts := conflicts || jsonb_build_object(
        'id', (item->>'id')::bigint, 'name', null,
        'requested', wanted, 'available', 0
      );
    elsif card.quantity < wanted then
      conflicts := conflicts || jsonb_build_object(
        'id', card.id, 'name', card.card_name,
        'requested', wanted, 'available', card.quantity
      );
    end if;
  end loop;

  if jsonb_array_length(conflicts) > 0 then
    return jsonb_build_object('ok', false, 'conflicts', conflicts);
  end if;

  -- Reuse the buyer's existing reservation for this sale location, if any
  -- (one reserve list per buyer per source). Otherwise create it.
  select * into target
  from public.collections
  where reserved_from = src.id and reserved_by = auth.uid()
  limit 1;

  if not found then
    insert into public.collections (user_id, name, share_id, reserved_by, reserved_from)
    values (
      src.user_id,
      'Reserved for ' || buyer_email
        || ' (' || to_char(now(), 'YYYY-MM-DD HH24:MI') || ' UTC)',
      gen_random_uuid(),
      auth.uid(),
      src.id
    )
    returning * into target;
  end if;

  -- Pass 2: everything is available (and still locked) — move it.
  for item in select * from jsonb_array_elements(p_items) loop
    wanted := greatest(coalesce((item->>'quantity')::int, 0), 0);
    if wanted <= 0 then
      continue;
    end if;

    select * into card
    from public.collection_cards
    where id = (item->>'id')::bigint and collection_id = src.id;

    take := least(wanted, card.quantity);

    insert into public.collection_cards (
      collection_id, scryfall_id, binder_name, binder_type, card_name,
      set_code, set_name, collector_number, foil, rarity, quantity,
      manabox_id, purchase_price, purchase_price_currency, misprint,
      altered, condition, language, added_at
    )
    values (
      target.id, card.scryfall_id, card.binder_name, card.binder_type, card.card_name,
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
    'ok', true,
    'location_id', target.id,
    'share_id', target.share_id,
    'name', target.name,
    'moved', moved
  );
end;
$$;
