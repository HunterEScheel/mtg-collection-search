-- Location sharing: a nullable share_id GUID per location. Anyone holding the
-- GUID can read that location (name + cards) through a security-definer RPC,
-- without signing in. No anon table policies are added, so shared locations
-- cannot be enumerated — the GUID is the capability.

alter table public.collections add column share_id uuid unique;

create or replace function public.get_shared_location(p_share_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'name', c.name,
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
