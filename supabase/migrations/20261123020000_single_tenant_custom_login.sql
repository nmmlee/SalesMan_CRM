-- Replace the workspace/Auth based prototype with one shared CRM and app-managed users.
-- This migration drops the empty prototype tables created by 20261123000000_initial_crm.sql.
begin;

create schema if not exists private;

drop function if exists public.complete_crm_password_setup();
drop function if exists public.crm_password_setup_required();
drop function if exists public.register_lead_from_email(uuid, text, text, text, text, text);
drop table if exists private.crm_password_setup cascade;

-- Drop the policy-owning tables before their helper functions. Dropping
-- workspace_members with CASCADE also removes policies that depend on
-- private.is_workspace_member, including policies on the remaining tables.
drop table if exists public.mail_drafts cascade;
drop table if exists public.mail_templates cascade;
drop table if exists public.inbound_emails cascade;
drop table if exists public.mail_connections cascade;
drop table if exists public.lead_activities cascade;
drop table if exists public.tasks cascade;
drop table if exists public.leads cascade;
drop table if exists public.lead_stages cascade;
drop table if exists public.user_settings cascade;
drop table if exists public.workspace_members cascade;
drop table if exists public.workspaces cascade;

drop function if exists private.crm_password_ready() cascade;
drop function if exists private.is_workspace_member(uuid) cascade;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table public.users (
  id uuid primary key default gen_random_uuid(),
  username text not null check (username = lower(username) and username ~ '^[a-z0-9][a-z0-9_-]{3,31}$'),
  password_hash text not null,
  display_name text not null check (btrim(display_name) <> ''),
  role text not null default 'member' check (role in ('admin', 'member')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (username)
);

create table public.app_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index app_sessions_user_idx on public.app_sessions(user_id, expires_at desc);

create table public.user_settings (
  user_id uuid primary key references public.users(id) on delete cascade,
  work_email text,
  updated_at timestamptz not null default now()
);

create table public.lead_stages (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (btrim(code) <> ''),
  label text not null check (btrim(label) <> ''),
  sort_order integer not null unique check (sort_order > 0)
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.lead_stages(id),
  owner_user_id uuid not null references public.users(id),
  company_name text not null check (btrim(company_name) <> ''),
  contact_name text,
  contact_email text,
  title text not null check (btrim(title) <> ''),
  summary text,
  company_size text,
  expected_users integer check (expected_users > 0),
  requested_services text,
  adoption_purpose text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index leads_stage_idx on public.leads(stage_id);
create index leads_owner_idx on public.leads(owner_user_id);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  assignee_user_id uuid not null references public.users(id),
  title text not null check (btrim(title) <> ''),
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed')),
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tasks_lead_idx on public.tasks(lead_id);
create index tasks_assignee_due_idx on public.tasks(assignee_user_id, due_date);

create table public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  author_user_id uuid references public.users(id),
  kind text not null check (kind in ('call', 'meeting', 'note', 'stage_change')),
  body text not null check (btrim(body) <> ''),
  previous_stage_id uuid references public.lead_stages(id),
  next_stage_id uuid references public.lead_stages(id),
  occurred_at timestamptz not null default now(),
  check (
    (kind = 'stage_change' and previous_stage_id is not null and next_stage_id is not null
      and previous_stage_id <> next_stage_id)
    or (kind <> 'stage_change' and previous_stage_id is null and next_stage_id is null)
  )
);
create index lead_activities_timeline_idx on public.lead_activities(lead_id, occurred_at desc);

create table public.mail_connections (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (btrim(provider) <> ''),
  external_account_id text not null check (btrim(external_account_id) <> ''),
  mailbox_address text not null check (btrim(mailbox_address) <> ''),
  sync_status text not null default 'disconnected'
    check (sync_status in ('disconnected', 'ready', 'working', 'failed', 'reconnect')),
  last_success_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, external_account_id)
);

create table public.inbound_emails (
  id uuid primary key default gen_random_uuid(),
  mail_connection_id uuid not null references public.mail_connections(id),
  external_message_id text not null check (btrim(external_message_id) <> ''),
  external_thread_id text,
  sender_name text,
  sender_email text not null,
  company_name text,
  subject text not null,
  body_text text,
  received_at timestamptz not null,
  lead_id uuid references public.leads(id),
  is_excluded boolean not null default false,
  fetched_at timestamptz not null default now(),
  unique (mail_connection_id, external_message_id),
  check (not is_excluded or lead_id is null)
);
create index inbound_emails_timeline_idx on public.inbound_emails(received_at desc);
create index inbound_emails_pending_idx on public.inbound_emails(received_at desc)
  where lead_id is null and not is_excluded;

create table public.mail_templates (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  subject text not null check (btrim(subject) <> ''),
  body text not null check (btrim(body) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, id)
);
create index mail_templates_owner_idx on public.mail_templates(owner_user_id, updated_at desc);

create table public.mail_drafts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  template_id uuid,
  from_address text,
  to_address text,
  subject text not null check (btrim(subject) <> ''),
  body text not null check (btrim(body) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (owner_user_id, template_id)
    references public.mail_templates(owner_user_id, id) on delete set null (template_id)
);
create index mail_drafts_owner_updated_idx on public.mail_drafts(owner_user_id, updated_at desc);

create or replace function private.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger users_set_updated_at before update on public.users
for each row execute function private.set_updated_at();
create trigger user_settings_set_updated_at before update on public.user_settings
for each row execute function private.set_updated_at();
create trigger leads_set_updated_at before update on public.leads
for each row execute function private.set_updated_at();
create trigger tasks_set_updated_at before update on public.tasks
for each row execute function private.set_updated_at();
create trigger templates_set_updated_at before update on public.mail_templates
for each row execute function private.set_updated_at();
create trigger drafts_set_updated_at before update on public.mail_drafts
for each row execute function private.set_updated_at();

create function public.crm_sign_up(p_username text, p_password text, p_display_name text)
returns table(user_id uuid, session_token text)
language plpgsql security definer set search_path = '' as $$
declare
  normalized_username text := lower(btrim(p_username));
  new_user_id uuid;
  new_token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  if normalized_username !~ '^[a-z0-9][a-z0-9_-]{3,31}$' then
    raise exception 'invalid_username' using errcode = '22023';
  end if;
  if char_length(p_password) < 8 then
    raise exception 'weak_password' using errcode = '22023';
  end if;
  if btrim(p_display_name) = '' or char_length(btrim(p_display_name)) > 40 then
    raise exception 'invalid_display_name' using errcode = '22023';
  end if;

  insert into public.users (username, password_hash, display_name)
  values (normalized_username, extensions.crypt(p_password, extensions.gen_salt('bf', 12)), btrim(p_display_name))
  returning id into new_user_id;

  insert into public.app_sessions (user_id, token_hash, expires_at)
  values (new_user_id, extensions.digest(new_token, 'sha256'), now() + interval '30 days');
  return query select new_user_id, new_token;
exception when unique_violation then
  raise exception 'username_taken' using errcode = '23505';
end;
$$;

create function public.crm_login(p_username text, p_password text)
returns table(user_id uuid, session_token text)
language plpgsql security definer set search_path = '' as $$
declare
  account public.users%rowtype;
  new_token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  select * into account from public.users
  where username = lower(btrim(p_username)) and active;
  if not found or extensions.crypt(p_password, account.password_hash) is distinct from account.password_hash then
    raise exception 'invalid_credentials' using errcode = '28000';
  end if;
  delete from public.app_sessions where expires_at <= now();
  insert into public.app_sessions (user_id, token_hash, expires_at)
  values (account.id, extensions.digest(new_token, 'sha256'), now() + interval '30 days');
  return query select account.id, new_token;
end;
$$;

create function public.crm_session_user(p_token text)
returns table(id uuid, username text, display_name text, role text)
language sql security definer set search_path = '' as $$
  update public.app_sessions session
  set last_seen_at = now()
  from public.users account
  where session.token_hash = extensions.digest(p_token, 'sha256')
    and session.expires_at > now() and account.id = session.user_id and account.active
  returning account.id, account.username, account.display_name, account.role;
$$;

create function public.crm_logout(p_token text)
returns void language sql security definer set search_path = '' as $$
  delete from public.app_sessions where token_hash = extensions.digest(p_token, 'sha256');
$$;

create function public.crm_change_password(p_token text, p_current_password text, p_new_password text)
returns void language plpgsql security definer set search_path = '' as $$
declare account public.users%rowtype;
begin
  select account_row.* into account
  from public.app_sessions session
  join public.users account_row on account_row.id = session.user_id
  where session.token_hash = extensions.digest(p_token, 'sha256')
    and session.expires_at > now() and account_row.active;
  if not found or extensions.crypt(p_current_password, account.password_hash) is distinct from account.password_hash then
    raise exception 'invalid_credentials' using errcode = '28000';
  end if;
  if char_length(p_new_password) < 8 then
    raise exception 'weak_password' using errcode = '22023';
  end if;
  update public.users set password_hash = extensions.crypt(p_new_password, extensions.gen_salt('bf', 12))
  where id = account.id;
  delete from public.app_sessions
  where user_id = account.id and token_hash <> extensions.digest(p_token, 'sha256');
end;
$$;

create function public.register_lead_from_email(
  p_user_id uuid, p_email_id uuid, p_title text, p_company_name text,
  p_contact_name text default null, p_contact_email text default null, p_summary text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  source_email public.inbound_emails%rowtype;
  initial_stage_id uuid;
  new_lead_id uuid;
begin
  if not exists (select 1 from public.users where id = p_user_id and active) then
    raise exception 'invalid_user' using errcode = '42501';
  end if;
  select * into source_email from public.inbound_emails where id = p_email_id for update;
  if not found then raise exception 'inquiry_not_found' using errcode = 'P0002'; end if;
  if source_email.lead_id is not null then return source_email.lead_id; end if;
  if source_email.is_excluded then raise exception 'inquiry_excluded' using errcode = '23514'; end if;
  select id into initial_stage_id from public.lead_stages order by sort_order limit 1;
  if initial_stage_id is null then raise exception 'missing_lead_stage' using errcode = '23514'; end if;
  insert into public.leads (stage_id, owner_user_id, title, company_name, contact_name, contact_email, summary)
  values (initial_stage_id, p_user_id, btrim(p_title), btrim(p_company_name),
    nullif(btrim(p_contact_name), ''), nullif(btrim(p_contact_email), ''), p_summary)
  returning id into new_lead_id;
  update public.inbound_emails set lead_id = new_lead_id where id = source_email.id;
  return new_lead_id;
end;
$$;

insert into public.lead_stages (code, label, sort_order) values
  ('new', '신규', 10), ('consultation', '상담', 20),
  ('proposal', '제안', 30), ('contract', '계약', 40);

alter table public.users enable row level security;
alter table public.app_sessions enable row level security;
alter table public.user_settings enable row level security;
alter table public.lead_stages enable row level security;
alter table public.leads enable row level security;
alter table public.tasks enable row level security;
alter table public.lead_activities enable row level security;
alter table public.mail_connections enable row level security;
alter table public.inbound_emails enable row level security;
alter table public.mail_templates enable row level security;
alter table public.mail_drafts enable row level security;

revoke all on table public.users, public.app_sessions, public.user_settings, public.lead_stages,
  public.leads, public.tasks, public.lead_activities, public.mail_connections,
  public.inbound_emails, public.mail_templates, public.mail_drafts from public, anon, authenticated;
revoke all on function public.crm_sign_up(text, text, text), public.crm_login(text, text),
  public.crm_session_user(text), public.crm_logout(text), public.crm_change_password(text, text, text),
  public.register_lead_from_email(uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
grant all on table public.users, public.app_sessions, public.user_settings, public.lead_stages,
  public.leads, public.tasks, public.lead_activities, public.mail_connections,
  public.inbound_emails, public.mail_templates, public.mail_drafts to service_role;
grant execute on function public.crm_sign_up(text, text, text), public.crm_login(text, text),
  public.crm_session_user(text), public.crm_logout(text), public.crm_change_password(text, text, text),
  public.register_lead_from_email(uuid, uuid, text, text, text, text, text) to service_role;

commit;
