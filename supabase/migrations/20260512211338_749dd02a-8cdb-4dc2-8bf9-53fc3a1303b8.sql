create schema if not exists private;

create or replace function private.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = _user_id
      and role = _role
  )
$$;

revoke all on function public.has_role(uuid, public.app_role) from public, anon, authenticated, service_role;
grant usage on schema private to authenticated, anon;
grant execute on function private.has_role(uuid, public.app_role) to authenticated, anon;

alter policy "admins manage associations"
on public.associations
using (private.has_role(auth.uid(), 'admin'::public.app_role))
with check (private.has_role(auth.uid(), 'admin'::public.app_role));

alter policy "users see linked associations"
on public.associations
using (
  exists (
    select 1
    from public.user_associations ua
    where ua.association_id = associations.id
      and ua.user_id = auth.uid()
  )
  or private.has_role(auth.uid(), 'admin'::public.app_role)
);

alter policy "admins read all profiles"
on public.profiles
using (private.has_role(auth.uid(), 'admin'::public.app_role));

alter policy "admins manage links"
on public.user_associations
using (private.has_role(auth.uid(), 'admin'::public.app_role))
with check (private.has_role(auth.uid(), 'admin'::public.app_role));

alter policy "users read own links"
on public.user_associations
using ((auth.uid() = user_id) or private.has_role(auth.uid(), 'admin'::public.app_role));

alter policy "admins manage roles"
on public.user_roles
using (private.has_role(auth.uid(), 'admin'::public.app_role))
with check (private.has_role(auth.uid(), 'admin'::public.app_role));