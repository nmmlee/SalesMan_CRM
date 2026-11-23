begin;

alter table public.user_settings add column if not exists row_version bigint not null default 1;
alter table public.leads add column if not exists row_version bigint not null default 1;
alter table public.tasks add column if not exists row_version bigint not null default 1;
alter table public.lead_activities add column if not exists row_version bigint not null default 1;
alter table public.mail_connections add column if not exists row_version bigint not null default 1;
alter table public.inbound_emails add column if not exists row_version bigint not null default 1;
alter table public.mail_templates add column if not exists row_version bigint not null default 1;
alter table public.mail_drafts add column if not exists row_version bigint not null default 1;

create or replace function private.bump_row_version()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.row_version := old.row_version + 1;
  return new;
end;
$$;

drop trigger if exists user_settings_bump_row_version on public.user_settings;
create trigger user_settings_bump_row_version before update on public.user_settings
for each row execute function private.bump_row_version();
drop trigger if exists leads_bump_row_version on public.leads;
create trigger leads_bump_row_version before update on public.leads
for each row execute function private.bump_row_version();
drop trigger if exists tasks_bump_row_version on public.tasks;
create trigger tasks_bump_row_version before update on public.tasks
for each row execute function private.bump_row_version();
drop trigger if exists lead_activities_bump_row_version on public.lead_activities;
create trigger lead_activities_bump_row_version before update on public.lead_activities
for each row execute function private.bump_row_version();
drop trigger if exists mail_connections_bump_row_version on public.mail_connections;
create trigger mail_connections_bump_row_version before update on public.mail_connections
for each row execute function private.bump_row_version();
drop trigger if exists inbound_emails_bump_row_version on public.inbound_emails;
create trigger inbound_emails_bump_row_version before update on public.inbound_emails
for each row execute function private.bump_row_version();
drop trigger if exists mail_templates_bump_row_version on public.mail_templates;
create trigger mail_templates_bump_row_version before update on public.mail_templates
for each row execute function private.bump_row_version();
drop trigger if exists mail_drafts_bump_row_version on public.mail_drafts;
create trigger mail_drafts_bump_row_version before update on public.mail_drafts
for each row execute function private.bump_row_version();

create or replace function public.crm_snapshot(p_user_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'members', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select id, display_name, role, active from public.users where active order by created_at, id
    ) x), '[]'::jsonb),
    'stages', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select id, label from public.lead_stages order by sort_order, id
    ) x), '[]'::jsonb),
    'leads', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select * from public.leads order by created_at desc, id
    ) x), '[]'::jsonb),
    'tasks', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select * from public.tasks order by created_at desc, id
    ) x), '[]'::jsonb),
    'mails', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select * from public.inbound_emails order by received_at desc, id
    ) x), '[]'::jsonb),
    'activities', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select * from public.lead_activities order by occurred_at desc, id
    ) x), '[]'::jsonb),
    'templates', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select * from public.mail_templates where owner_user_id = p_user_id order by created_at desc, id
    ) x), '[]'::jsonb),
    'drafts', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select * from public.mail_drafts where owner_user_id = p_user_id order by updated_at desc, id
    ) x), '[]'::jsonb),
    'settings', (select to_jsonb(x) from (
      select work_email, row_version from public.user_settings where user_id = p_user_id
    ) x),
    'connection', (select to_jsonb(x) from (
      select id, sync_status, last_success_at, row_version from public.mail_connections
      order by created_at desc, id limit 1
    ) x)
  );
$$;

create or replace function public.crm_update_lead(
  p_user_id uuid, p_id uuid, p_expected_version bigint, p_stage_id uuid,
  p_owner_user_id uuid, p_company_name text, p_contact_name text, p_contact_email text,
  p_title text, p_summary text, p_company_size text, p_expected_users integer,
  p_requested_services text, p_adoption_purpose text
)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  old_stage_id uuid;
  old_stage_label text;
  new_stage_label text;
  saved_version bigint;
begin
  if not exists (select 1 from public.users where id = p_user_id and active) then
    raise exception 'invalid_user' using errcode = '42501';
  end if;

  select stage_id into old_stage_id from public.leads
  where id = p_id and row_version = p_expected_version for update;
  if not found then
    raise exception 'concurrent_update' using errcode = '40001';
  end if;

  update public.leads set
    stage_id = p_stage_id, owner_user_id = p_owner_user_id,
    company_name = p_company_name, contact_name = p_contact_name,
    contact_email = p_contact_email, title = p_title, summary = p_summary,
    company_size = p_company_size, expected_users = p_expected_users,
    requested_services = p_requested_services, adoption_purpose = p_adoption_purpose
  where id = p_id returning row_version into saved_version;

  if old_stage_id <> p_stage_id then
    select label into old_stage_label from public.lead_stages where id = old_stage_id;
    select label into new_stage_label from public.lead_stages where id = p_stage_id;
    insert into public.lead_activities
      (lead_id, author_user_id, kind, body, previous_stage_id, next_stage_id)
    values
      (p_id, p_user_id, 'stage_change', coalesce(old_stage_label, '이전 단계') || ' → ' ||
       coalesce(new_stage_label, '다음 단계'), old_stage_id, p_stage_id);
  end if;
  return saved_version;
end;
$$;

revoke all on function public.crm_snapshot(uuid),
  public.crm_update_lead(uuid, uuid, bigint, uuid, uuid, text, text, text, text, text, text, integer, text, text)
  from public, anon, authenticated;
grant execute on function public.crm_snapshot(uuid),
  public.crm_update_lead(uuid, uuid, bigint, uuid, uuid, text, text, text, text, text, text, integer, text, text)
  to service_role;

commit;
