-- Supabase schema for the coin-hunt game
create table if not exists public.guesses (
  id bigserial primary key,
  email text not null,
  email_lc text not null,
  name text,
  lat double precision not null,
  lng double precision not null,
  distance_km double precision not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists guesses_email_lc_key on public.guesses (email_lc);
