-- Initial schema for a new Supabase project.
begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id),
  user_id uuid not null references auth.users(id),
  display_name text not null check (btrim(display_name) <> ''),
  role text not null default 'member' check (role in ('admin', 'member')),
  active boolean not null default true,
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index workspace_members_user_idx on public.workspace_members(user_id, workspace_id) where active;

create table public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  work_email text,
  updated_at timestamptz not null default now()
);

create table public.lead_stages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  code text not null check (btrim(code) <> ''),
  label text not null check (btrim(label) <> ''),
  sort_order integer not null check (sort_order > 0),
  unique (workspace_id, id),
  unique (workspace_id, code),
  unique (workspace_id, sort_order)
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  stage_id uuid not null,
  owner_user_id uuid not null,
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
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, stage_id) references public.lead_stages(workspace_id, id),
  foreign key (workspace_id, owner_user_id) references public.workspace_members(workspace_id, user_id)
);

create index leads_stage_idx on public.leads(workspace_id, stage_id);
create index leads_owner_idx on public.leads(workspace_id, owner_user_id);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  lead_id uuid not null,
  assignee_user_id uuid not null,
  title text not null check (btrim(title) <> ''),
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed')),
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, lead_id) references public.leads(workspace_id, id),
  foreign key (workspace_id, assignee_user_id) references public.workspace_members(workspace_id, user_id)
);

create index tasks_lead_idx on public.tasks(workspace_id, lead_id);
create index tasks_assignee_due_idx on public.tasks(workspace_id, assignee_user_id, due_date);

create table public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  lead_id uuid not null,
  author_user_id uuid default auth.uid(),
  kind text not null check (kind in ('call', 'meeting', 'note', 'stage_change')),
  body text not null check (btrim(body) <> ''),
  previous_stage_id uuid,
  next_stage_id uuid,
  occurred_at timestamptz not null default now(),
  foreign key (workspace_id, lead_id) references public.leads(workspace_id, id),
  foreign key (workspace_id, author_user_id) references public.workspace_members(workspace_id, user_id),
  foreign key (workspace_id, previous_stage_id) references public.lead_stages(workspace_id, id),
  foreign key (workspace_id, next_stage_id) references public.lead_stages(workspace_id, id),
  check (
    (kind = 'stage_change' and previous_stage_id is not null and next_stage_id is not null
      and previous_stage_id <> next_stage_id)
    or (kind <> 'stage_change' and previous_stage_id is null and next_stage_id is null)
  )
);

create index lead_activities_timeline_idx on public.lead_activities(workspace_id, lead_id, occurred_at desc);

-- Metadata only. OAuth credentials and sync cursors belong in server-managed storage.
create table public.mail_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  provider text not null check (btrim(provider) <> ''),
  external_account_id text not null check (btrim(external_account_id) <> ''),
  mailbox_address text not null check (btrim(mailbox_address) <> ''),
  sync_status text not null default 'disconnected'
    check (sync_status in ('disconnected', 'ready', 'working', 'failed', 'reconnect')),
  last_success_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workspace_id, id),
  unique (workspace_id, provider, external_account_id)
);

create table public.inbound_emails (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  mail_connection_id uuid not null,
  external_message_id text not null check (btrim(external_message_id) <> ''),
  external_thread_id text,
  sender_name text,
  sender_email text not null,
  company_name text,
  subject text not null,
  body_text text,
  received_at timestamptz not null,
  lead_id uuid,
  is_excluded boolean not null default false,
  fetched_at timestamptz not null default now(),
  unique (mail_connection_id, external_message_id),
  foreign key (workspace_id, mail_connection_id) references public.mail_connections(workspace_id, id),
  foreign key (workspace_id, lead_id) references public.leads(workspace_id, id),
  check (not is_excluded or lead_id is null)
);

create index inbound_emails_timeline_idx on public.inbound_emails(workspace_id, received_at desc);
create index inbound_emails_lead_idx on public.inbound_emails(workspace_id, lead_id);
create index inbound_emails_pending_idx on public.inbound_emails(workspace_id, received_at desc)
  where lead_id is null and not is_excluded;

create table public.mail_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  owner_user_id uuid not null default auth.uid(),
  name text not null check (btrim(name) <> ''),
  subject text not null check (btrim(subject) <> ''),
  body text not null check (btrim(body) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, owner_user_id, id),
  foreign key (workspace_id, owner_user_id) references public.workspace_members(workspace_id, user_id)
);

create table public.mail_drafts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  owner_user_id uuid not null default auth.uid(),
  lead_id uuid not null,
  template_id uuid,
  from_address text,
  to_address text,
  subject text not null check (btrim(subject) <> ''),
  body text not null check (btrim(body) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, lead_id) references public.leads(workspace_id, id),
  foreign key (workspace_id, owner_user_id) references public.workspace_members(workspace_id, user_id),
  foreign key (workspace_id, owner_user_id, template_id) references public.mail_templates(workspace_id, owner_user_id, id)
);

create index mail_drafts_owner_updated_idx on public.mail_drafts(workspace_id, owner_user_id, updated_at desc);

create function private.is_workspace_member(target_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = target_workspace and user_id = (select auth.uid()) and active
  );
$$;

revoke all on function private.is_workspace_member(uuid) from public, anon, authenticated;
grant execute on function private.is_workspace_member(uuid) to authenticated;

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

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

create function private.log_stage_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.lead_activities (
    workspace_id, lead_id, author_user_id, kind, body, previous_stage_id, next_stage_id
  )
  select new.workspace_id, new.id, (select auth.uid()), 'stage_change',
    old_stage.label || ' → ' || new_stage.label, old.stage_id, new.stage_id
  from public.lead_stages old_stage
  join public.lead_stages new_stage on new_stage.workspace_id = old_stage.workspace_id
  where old_stage.workspace_id = new.workspace_id
    and old_stage.id = old.stage_id and new_stage.id = new.stage_id;
  return new;
end;
$$;

create trigger leads_log_stage_change after update of stage_id on public.leads
for each row when (old.stage_id is distinct from new.stage_id)
execute function private.log_stage_change();

revoke all on function private.set_updated_at() from public, anon, authenticated;
revoke all on function private.log_stage_change() from public, anon, authenticated;

-- Public RPC with an explicit membership check before locking the source email.
create function public.register_lead_from_email(
  p_email_id uuid,
  p_title text,
  p_company_name text,
  p_contact_name text default null,
  p_contact_email text default null,
  p_summary text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_email public.inbound_emails%rowtype;
  initial_stage_id uuid;
  new_lead_id uuid;
begin
  select * into source_email
  from public.inbound_emails
  where id = p_email_id and private.is_workspace_member(workspace_id)
  for update;

  if not found then
    raise exception 'Inquiry not found' using errcode = 'P0002';
  end if;
  if source_email.lead_id is not null then
    return source_email.lead_id;
  end if;
  if source_email.is_excluded then
    raise exception 'Return the inquiry to the review queue before registering it' using errcode = '23514';
  end if;

  select id into initial_stage_id
  from public.lead_stages
  where workspace_id = source_email.workspace_id
  order by sort_order
  limit 1;

  if initial_stage_id is null then
    raise exception 'Configure the initial lead stage before registering inquiries' using errcode = '23514';
  end if;

  insert into public.leads (workspace_id, stage_id, owner_user_id, title, company_name, contact_name, contact_email, summary)
  values (source_email.workspace_id, initial_stage_id, (select auth.uid()), btrim(p_title),
    btrim(p_company_name), nullif(btrim(p_contact_name), ''), nullif(btrim(p_contact_email), ''), p_summary)
  returning id into new_lead_id;

  update public.inbound_emails set lead_id = new_lead_id where id = source_email.id;
  return new_lead_id;
end;
$$;

revoke all on function public.register_lead_from_email(uuid, text, text, text, text, text)
from public, anon, authenticated;
grant execute on function public.register_lead_from_email(uuid, text, text, text, text, text)
to authenticated;

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.user_settings enable row level security;
alter table public.lead_stages enable row level security;
alter table public.leads enable row level security;
alter table public.tasks enable row level security;
alter table public.lead_activities enable row level security;
alter table public.mail_connections enable row level security;
alter table public.inbound_emails enable row level security;
alter table public.mail_templates enable row level security;
alter table public.mail_drafts enable row level security;

revoke all on table public.workspaces, public.workspace_members, public.user_settings, public.lead_stages,
  public.leads, public.tasks, public.lead_activities, public.mail_connections, public.inbound_emails,
  public.mail_templates, public.mail_drafts from public, anon, authenticated;

grant select on table public.workspaces, public.workspace_members, public.user_settings, public.lead_stages,
  public.leads, public.tasks, public.lead_activities, public.mail_connections, public.inbound_emails,
  public.mail_templates, public.mail_drafts to authenticated;

grant insert on table public.user_settings, public.leads, public.tasks, public.lead_activities,
  public.mail_templates, public.mail_drafts to authenticated;
grant update (work_email) on public.user_settings to authenticated;
grant update (stage_id, owner_user_id, company_name, contact_name, contact_email, title, summary, company_size,
  expected_users, requested_services, adoption_purpose) on public.leads to authenticated;
grant update (lead_id, assignee_user_id, title, status, due_date) on public.tasks to authenticated;
grant delete on public.tasks to authenticated;
grant update (is_excluded) on public.inbound_emails to authenticated;
grant update (name, subject, body) on public.mail_templates to authenticated;
grant update (template_id, from_address, to_address, subject, body) on public.mail_drafts to authenticated;

grant select, insert, update on table public.mail_connections, public.inbound_emails to service_role;

create policy workspace_read on public.workspaces for select to authenticated
using (private.is_workspace_member(id));

create policy members_read on public.workspace_members for select to authenticated
using (private.is_workspace_member(workspace_id));

create policy user_settings_read on public.user_settings for select to authenticated
using (user_id = (select auth.uid()));
create policy user_settings_insert on public.user_settings for insert to authenticated
with check (user_id = (select auth.uid()));
create policy user_settings_update on public.user_settings for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy stages_read on public.lead_stages for select to authenticated
using (private.is_workspace_member(workspace_id));

create policy leads_read on public.leads for select to authenticated
using (private.is_workspace_member(workspace_id));
create policy leads_insert on public.leads for insert to authenticated
with check (private.is_workspace_member(workspace_id));
create policy leads_update on public.leads for update to authenticated
using (private.is_workspace_member(workspace_id)) with check (private.is_workspace_member(workspace_id));

create policy tasks_write_and_read on public.tasks for all to authenticated
using (private.is_workspace_member(workspace_id)) with check (private.is_workspace_member(workspace_id));

create policy activities_read on public.lead_activities for select to authenticated
using (private.is_workspace_member(workspace_id));
create policy activities_insert on public.lead_activities for insert to authenticated
with check (
  private.is_workspace_member(workspace_id) and author_user_id = (select auth.uid()) and kind <> 'stage_change'
);

create policy connections_read on public.mail_connections for select to authenticated
using (private.is_workspace_member(workspace_id));

create policy inbound_read on public.inbound_emails for select to authenticated
using (private.is_workspace_member(workspace_id));
create policy inbound_exclusion_update on public.inbound_emails for update to authenticated
using (private.is_workspace_member(workspace_id) and lead_id is null)
with check (private.is_workspace_member(workspace_id) and lead_id is null);

create policy templates_owned on public.mail_templates for all to authenticated
using (private.is_workspace_member(workspace_id) and owner_user_id = (select auth.uid()))
with check (private.is_workspace_member(workspace_id) and owner_user_id = (select auth.uid()));

create policy drafts_owned on public.mail_drafts for all to authenticated
using (private.is_workspace_member(workspace_id) and owner_user_id = (select auth.uid()))
with check (private.is_workspace_member(workspace_id) and owner_user_id = (select auth.uid()));

commit;
