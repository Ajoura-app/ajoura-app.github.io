-- AJOURA: jaettu talli (v0.117). Toistettavissa.
--
-- Talli on omistajan rivi taulussa garages (user_id = omistaja). Omistaja voi kutsua jäseniä kertakäyttöisellä
-- linkillä (voimassa 7 päivää). Jäsen näkee ja muokkaa omistajan tallia kuten omistaja, mutta vain omistaja kutsuu ja
-- poistaa jäseniä. Käyttäjä on enintään yhden jaetun tallin jäsen, eikä jäsen voi samalla jakaa omaa talliaan.
-- Liittyessä liittyjän oma pilvirivi poistetaan: sovellus on jo yhdistänyt sen tiedot laitteelle ja siirtää ne
-- yhteiseen talliin seuraavassa synkronoinnissa. Kutsun koodista tallennetaan vain tiiviste (sha256).

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.garage_members (
  member_id uuid primary key references auth.users (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  constraint garage_members_not_self check (member_id <> owner_id)
);
create index if not exists garage_members_owner on public.garage_members (owner_id);

create table if not exists public.garage_invites (
  token_hash text primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_by uuid references auth.users (id) on delete set null,
  used_at timestamptz
);
create index if not exists garage_invites_owner on public.garage_invites (owner_id);

alter table public.garage_members enable row level security;
alter table public.garage_invites enable row level security;
revoke all on public.garage_members, public.garage_invites from anon, authenticated;

-- Onko kirjautunut käyttäjä tämän omistajan tallin jäsen. Rivitason suojaus käyttää tätä (jäsentaulu ei näy suoraan).
create or replace function public.ajoura_is_member(p_owner uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.garage_members m where m.member_id = auth.uid() and m.owner_id = p_owner);
$$;

-- Talli: omistaja kaikki, jäsen lukee ja päivittää. Luonti ja poisto vain omalle riville.
drop policy if exists "garages_select_own" on public.garages;
drop policy if exists "garages_update_own" on public.garages;
create policy "garages_select_own" on public.garages for select to authenticated
  using ((select auth.uid()) = user_id or public.ajoura_is_member(user_id));
create policy "garages_update_own" on public.garages for update to authenticated
  using ((select auth.uid()) = user_id or public.ajoura_is_member(user_id))
  with check ((select auth.uid()) = user_id or public.ajoura_is_member(user_id));

-- Kenen talliin kirjautunut käyttäjä kuuluu, ja jäsenet (omistajalle) tai omistaja (jäsenelle).
create or replace function public.my_garage() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_owner uuid;
begin
  if v_user is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select m.owner_id into v_owner from public.garage_members m where m.member_id = v_user;
  if v_owner is not null then
    return jsonb_build_object('owner', v_owner, 'role', 'member',
      'owner_email', (select u.email from auth.users u where u.id = v_owner));
  end if;
  return jsonb_build_object('owner', v_user, 'role', 'owner', 'members', coalesce((
    select jsonb_agg(jsonb_build_object('id', m.member_id, 'email', u.email, 'joined', m.joined_at) order by m.joined_at)
    from public.garage_members m join auth.users u on u.id = m.member_id where m.owner_id = v_user), '[]'::jsonb));
end;
$$;

-- Omistaja luo kutsun. Palauttaa koodin vain tämän kerran; tietokantaan jää tiiviste.
create or replace function public.create_invite() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_token text;
begin
  if v_user is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if exists (select 1 from public.garage_members m where m.member_id = v_user) then
    raise exception 'members cannot invite' using errcode = '42501';
  end if;
  if (select count(*) from public.garage_members m where m.owner_id = v_user) >= 5 then
    raise exception 'too many members' using errcode = 'P0001';
  end if;
  delete from public.garage_invites i where i.owner_id = v_user and (i.expires_at < now() or i.used_at is not null);
  if (select count(*) from public.garage_invites i where i.owner_id = v_user) >= 5 then
    raise exception 'too many invites' using errcode = 'P0001';
  end if;
  v_token := translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_');
  insert into public.garage_invites (token_hash, owner_id) values (encode(extensions.digest(v_token, 'sha256'), 'hex'), v_user);
  return jsonb_build_object('token', v_token, 'expires', now() + interval '7 days');
end;
$$;

-- Liittyminen kutsulla. Tarkistaa kutsun (olemassa, käyttämätön, voimassa, ei oma) ja ettei liittyjä jo jaa
-- omaa talliaan tai kuulu toiseen talliin.
create or replace function public.accept_invite(p_token text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_inv public.garage_invites;
begin
  if v_user is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select * into v_inv from public.garage_invites i
    where i.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') for update;
  if not found or v_inv.used_at is not null or v_inv.expires_at < now() then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  if v_inv.owner_id = v_user then return jsonb_build_object('ok', false, 'reason', 'own'); end if;
  if exists (select 1 from public.garage_members m where m.member_id = v_user) then
    return jsonb_build_object('ok', false, 'reason', 'already_member');
  end if;
  if exists (select 1 from public.garage_members m where m.owner_id = v_user) then
    return jsonb_build_object('ok', false, 'reason', 'has_members');
  end if;
  if (select count(*) from public.garage_members m where m.owner_id = v_inv.owner_id) >= 5 then
    return jsonb_build_object('ok', false, 'reason', 'full');
  end if;
  insert into public.garage_members (member_id, owner_id) values (v_user, v_inv.owner_id);
  update public.garage_invites set used_by = v_user, used_at = now() where token_hash = v_inv.token_hash;
  delete from public.garages g where g.user_id = v_user;
  return jsonb_build_object('ok', true, 'owner', v_inv.owner_id);
end;
$$;

-- Omistaja poistaa jäsenen; jäsen poistuu itse.
create or replace function public.remove_member(p_member uuid) returns void
language sql volatile security definer set search_path = '' as $$
  delete from public.garage_members m where m.member_id = p_member and m.owner_id = auth.uid();
$$;
create or replace function public.leave_garage() returns void
language sql volatile security definer set search_path = '' as $$
  delete from public.garage_members m where m.member_id = auth.uid();
$$;

revoke all on function public.ajoura_is_member(uuid) from public, anon, authenticated;
revoke all on function public.my_garage() from public, anon, authenticated;
revoke all on function public.create_invite() from public, anon, authenticated;
revoke all on function public.accept_invite(text) from public, anon, authenticated;
revoke all on function public.remove_member(uuid) from public, anon, authenticated;
revoke all on function public.leave_garage() from public, anon, authenticated;
grant execute on function public.ajoura_is_member(uuid), public.my_garage(), public.create_invite(),
  public.accept_invite(text), public.remove_member(uuid), public.leave_garage() to authenticated;
