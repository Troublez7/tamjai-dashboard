create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.workers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  discord_channel_id text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.match_reports (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.workers(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  result text not null default 'unknown',
  map_name text,
  mode text,
  completion_time text,
  session_time text,
  wins_losses text,
  raw_text text not null default '',
  screenshot_url text,
  source_message_id text not null unique,
  source_channel_id text not null,
  source_guild_id text,
  source_created_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists workers_owner_idx on public.workers(owner_id);
create index if not exists reports_owner_created_idx on public.match_reports(owner_id, created_at desc);
create index if not exists reports_worker_created_idx on public.match_reports(worker_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.workers enable row level security;
alter table public.match_reports enable row level security;

create policy "customers read own profile" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "customers update own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "customers read own workers" on public.workers
  for select to authenticated using (owner_id = auth.uid());
create policy "customers read own reports" on public.match_reports
  for select to authenticated using (owner_id = auth.uid());

-- Inserts/updates are performed only by the trusted server using the service-role key.
-- Never expose the service-role key in the browser.

-- Automatically create a customer profile after email signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();
