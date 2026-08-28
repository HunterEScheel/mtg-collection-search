-- Location types: an EDH deck (with a required commander) or a plain
-- collection box. EDH locations power the EDHREC feature; the app enforces
-- that EDH locations carry a commander name.

alter table public.collections
  add column location_type text not null default 'collection'
    check (location_type in ('edh', 'collection')),
  add column commander text;
