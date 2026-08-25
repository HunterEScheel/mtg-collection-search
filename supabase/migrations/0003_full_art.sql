-- is:fullart search: project Scryfall's full_art flag into its own column,
-- backfilled from the cached raw payload for cards fetched before this change.

alter table public.scryfall_cards add column full_art boolean;

update public.scryfall_cards
set full_art = (data ->> 'full_art')::boolean
where data ? 'full_art';
