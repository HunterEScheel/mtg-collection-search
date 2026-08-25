-- Reservation location names now include the time (UTC), not just the date.

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
    'Reserved for ' || btrim(p_buyer_name)
      || ' (' || to_char(now(), 'YYYY-MM-DD HH24:MI') || ' UTC)',
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
