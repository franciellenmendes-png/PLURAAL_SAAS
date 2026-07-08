
-- Roles enum + table
create type public.app_role as enum ('admin', 'user');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''));
  insert into public.user_roles (user_id, role) values (new.id, 'user');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Associations
create table public.associations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  bi_url text not null,
  created_at timestamptz not null default now()
);
alter table public.associations enable row level security;

-- User <-> association links
create table public.user_associations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  association_id uuid not null references public.associations(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, association_id)
);
alter table public.user_associations enable row level security;

-- Policies: profiles
create policy "users read own profile" on public.profiles for select using (auth.uid() = id);
create policy "users update own profile" on public.profiles for update using (auth.uid() = id);
create policy "admins read all profiles" on public.profiles for select using (public.has_role(auth.uid(), 'admin'));

-- Policies: user_roles
create policy "users read own roles" on public.user_roles for select using (auth.uid() = user_id);
create policy "admins manage roles" on public.user_roles for all using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- Policies: associations - user sees only those linked; admin sees all
create policy "users see linked associations" on public.associations for select using (
  exists (select 1 from public.user_associations ua where ua.association_id = associations.id and ua.user_id = auth.uid())
  or public.has_role(auth.uid(), 'admin')
);
create policy "admins manage associations" on public.associations for all using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- Policies: user_associations
create policy "users read own links" on public.user_associations for select using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));
create policy "admins manage links" on public.user_associations for all using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- Seed associations
insert into public.associations (slug, name, bi_url) values
  ('asuma', 'ASUMA', 'https://app.powerbi.com/view?r=eyJrIjoiMWFlMGIzZmMtZmIyOS00OTI4LWI3MTItNGEyMWFlYjQ2NDEyIiwidCI6ImM4NGI3YzEwLTdlZWYtNDFlNS1hYjllLTRlMWQ1NjlkNzIyYiJ9'),
  ('ama', 'AMA', 'https://app.powerbi.com/view?r=eyJrIjoiY2U1ZTM1OGMtODY4OS00MmRiLWE3OGEtNmVhZmRjNjBjMDhjIiwidCI6ImM4NGI3YzEwLTdlZWYtNDFlNS1hYjllLTRlMWQ1NjlkNzIyYiJ9'),
  ('anpa', 'ANPA', 'https://app.powerbi.com/view?r=eyJrIjoiNmI5NTVjNTUtZDgxOS00ZjRlLWFlNmYtYTcxZGI4NTNhOTBmIiwidCI6ImM4NGI3YzEwLTdlZWYtNDFlNS1hYjllLTRlMWQ1NjlkNzIyYiJ9'),
  ('blumenau', 'BLUMENAU', 'https://app.powerbi.com/view?r=eyJrIjoiYmMzZjI1ZjQtZjc0ZC00NDhhLWEzNTctYjQzNjFlZWYzMTlkIiwidCI6ImM4NGI3YzEwLTdlZWYtNDFlNS1hYjllLTRlMWQ1NjlkNzIyYiJ9'),
  ('campinas', 'CAMPINAS', 'https://app.powerbi.com/view?r=eyJrIjoiMTAxOTQzY2UtMjNhMC00OWY1LTgzMDMtNjc5Njg3ODc1MGYyIiwidCI6ImM4NGI3YzEwLTdlZWYtNDFlNS1hYjllLTRlMWQ1NjlkNzIyYiJ9'),
  ('iabc', 'IABC', 'https://app.powerbi.com/view?r=eyJrIjoiMWUyOWYzYTQtMTY4NC00Mzk4LWFiNGQtZGQxZThiYmM0MTEzIiwidCI6ImM4NGI3YzEwLTdlZWYtNDFlNS1hYjllLTRlMWQ1NjlkNzIyYiJ9'),
  ('iaesc', 'IAESC', 'https://app.powerbi.com/view?r=eyJrIjoiMTEyYzExYTItZjlhZC00NzJjLTgwYzQtY2YxNWIzNTZkZTQyIiwidCI6ImM4NGI3YzEwLTdlZWYtNDFlNS1hYjllLTRlMWQ1NjlkNzIyYiJ9'),
  ('mnem', 'MNEM', 'https://app.powerbi.com/view?r=eyJrIjoiZTNjYjQ4YTYtMjZmNC00YTBlLWI5OWQtNWE5ZjBmOWI5NDU2IiwidCI6ImM4NGI3YzEwLTdlZWYtNDFlNS1hYjllLTRlMWQ1NjlkNzIyYiJ9'),
  ('mto', 'MTO', 'https://app.powerbi.com/view?r=eyJrIjoiYmRhOTVkNWUtNzcxZi00N2JjLWFkNTQtYjY5Y2VjYmM1N2EyIiwidCI6ImM4NGI3YzEwLTdlZWYtNDFlNS1hYjllLTRlMWQ1NjlkNzIyYiJ9'),
  ('ap', 'AP', 'https://app.powerbi.com/view?r=eyJrIjoiMzE1ZjU4M2YtMTIyNS00MzIwLTgwZjgtNTE4MTNkY2I2NTY3IiwidCI6ImM4NGI3YzEwLTdlZWYtNDFlNS1hYjllLTRlMWQ1NjlkNzIyYiJ9'),
  ('apse', 'APSE', 'https://app.powerbi.com/view?r=eyJrIjoiMWYwNDA2N2QtNjg1MC00ZjRiLTgyMTItMWFkMDZmOTkxYTZiIiwidCI6ImM4NGI3YzEwLTdlZWYtNDFlNS1hYjllLTRlMWQ1NjlkNzIyYiJ9'),
  ('alm', 'ALM', 'https://app.powerbi.com/view?r=eyJrIjoiNjdjNTE2ZDQtZjIxNy00NjE3LWJkYzgtMzAwY2UxODk5YTE3IiwidCI6ImM4NGI3YzEwLTdlZWYtNDFlNS1hYjllLTRlMWQ1NjlkNzIyYiJ9'),
  ('unasp', 'UNASP', 'https://app.powerbi.com/view?r=eyJrIjoiMTNjYTY1ZGUtOWI2Zi00ZDc5LThlMjgtZjU3NWU3ZjNhZmM3IiwidCI6ImM4NGI3YzEwLTdlZWYtNDFlNS1hYjllLTRlMWQ1NjlkNzIyYiJ9'),
  ('uneb', 'UNEB', 'https://app.powerbi.com/view?r=eyJrIjoiZDg2YTg5ZGEtMzM0Ny00Zjk1LWEyYWYtZTFjNjE4MDFiNzM2IiwidCI6ImM4NGI3YzEwLTdlZWYtNDFlNS1hYjllLTRlMWQ1NjlkNzIyYiJ9'),
  ('unob', 'UNOB', 'https://app.powerbi.com/view?r=eyJrIjoiMDI4M2VmMTEtYThhNC00MjM1LWEyOWMtOWJlMzMyOWE1M2VhIiwidCI6ImM4NGI3YzEwLTdlZWYtNDFlNS1hYjllLTRlMWQ1NjlkNzIyYiJ9'),
  ('usb', 'USB', 'https://app.powerbi.com/view?r=eyJrIjoiMDI4M2VmMTEtYThhNC00MjM1LWEyOWMtOWJlMzMyOWE1M2VhIiwidCI6ImM4NGI3YzEwLTdlZWYtNDFlNS1hYjllLTRlMWQ1NjlkNzIyYiJ9'),
  ('acp', 'ACP', 'https://app.powerbi.com/view?r=eyJrIjoiNDg1YjMyZGQtYTZmOC00MTJkLWE2YTMtNjgzYTQwMzdiNmVlIiwidCI6ImM4NGI3YzEwLTdlZWYtNDFlNS1hYjllLTRlMWQ1NjlkNzIyYiJ9'),
  ('acsr', 'ACSR', 'https://app.powerbi.com/view?r=eyJrIjoiMmQzNGRiNzItYjA1Zi00ZTA4LTg5MjctYzk4NjY3YmFmMDVjIiwidCI6ImM4NGI3YzEwLTdlZWYtNDFlNS1hYjllLTRlMWQ1NjlkNzIyYiJ9');
