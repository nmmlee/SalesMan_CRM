begin;

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  legal_number text not null default '' check (legal_number = '' or legal_number ~ '^[0-9]{13}$'),
  business_number text not null default '' check (business_number = '' or business_number ~ '^[0-9]{10}$'),
  website text not null default '',
  row_version bigint not null default 1
);
create unique index companies_legal_number_idx on public.companies(legal_number) where legal_number <> '';
create unique index companies_business_number_idx on public.companies(business_number) where business_number <> '';
create index companies_name_idx on public.companies(lower(btrim(name)));
create unique index companies_unidentified_name_idx on public.companies(lower(btrim(name)))
  where legal_number = '' and business_number = '';

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  name text not null check (btrim(name) <> ''),
  email text not null default '',
  phone text not null default '',
  position text not null default '',
  row_version bigint not null default 1,
  unique (company_id, id)
);
create unique index contacts_email_idx on public.contacts(company_id, lower(btrim(email))) where email <> '';
create unique index contacts_without_email_idx on public.contacts(company_id, lower(btrim(name)), phone) where email = '';

create table public.contact_touches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  contact_id uuid,
  kind text not null check (kind in ('통화', '미팅', '이메일', '메모')),
  body text not null check (btrim(body) <> ''),
  author_user_id uuid not null references public.users(id),
  occurred_at timestamptz not null,
  foreign key (company_id, contact_id) references public.contacts(company_id, id)
);
create index contact_touches_company_idx on public.contact_touches(company_id, occurred_at desc);

alter table public.leads add column company_id uuid references public.companies(id),
  add column contact_id uuid,
  add foreign key (company_id, contact_id) references public.contacts(company_id, id);
create index leads_directory_idx on public.leads(company_id, contact_id);

alter table public.inbound_emails add column contact_id uuid references public.contacts(id),
  add check (not is_excluded or contact_id is null);
create index inbound_emails_contact_idx on public.inbound_emails(contact_id);

insert into public.companies(name)
select min(btrim(company_name)) from public.leads group by lower(btrim(company_name));

update public.leads l set company_id = c.id
from public.companies c where lower(btrim(c.name)) = lower(btrim(l.company_name));

insert into public.contacts(company_id, name, email)
select distinct on (company_id, email_key, name_key)
  company_id, coalesce(nullif(btrim(display_name), ''), email_key), email_key
from (
  select l.company_id, coalesce(nullif(btrim(l.contact_name), ''), btrim(m.sender_name)) as display_name,
    lower(btrim(coalesce(nullif(btrim(l.contact_email), ''), m.sender_email, ''))) as email_key,
    l.created_at, l.id
  from public.leads l
  left join lateral (
    select sender_name, sender_email from public.inbound_emails
    where lead_id = l.id order by received_at desc, id limit 1
  ) m on true
) source
cross join lateral (select case when email_key = '' then lower(btrim(coalesce(display_name, ''))) else '' end as name_key) identity
where email_key <> '' or name_key <> ''
order by company_id, email_key, name_key, (nullif(btrim(display_name), '') is not null) desc, created_at desc, id;

with identities as (
  select l.id, l.company_id, lower(btrim(coalesce(nullif(btrim(l.contact_email), ''), m.sender_email, ''))) as email,
    lower(btrim(coalesce(nullif(btrim(l.contact_name), ''), m.sender_name, ''))) as name
  from public.leads l
  left join lateral (
    select sender_name, sender_email from public.inbound_emails
    where lead_id = l.id order by received_at desc, id limit 1
  ) m on true
)
update public.leads l set contact_id = c.id
from identities i join public.contacts c on c.company_id = i.company_id and c.email = i.email
  and (i.email <> '' or lower(btrim(c.name)) = i.name)
where l.id = i.id;

update public.inbound_emails m set contact_id = l.contact_id
from public.leads l where m.lead_id = l.id and not m.is_excluded
  and (lower(btrim(m.sender_email)) = lower(btrim(l.contact_email)) or nullif(btrim(l.contact_email), '') is null)
  and l.contact_id in (select c.id from public.contacts c where c.email = lower(btrim(m.sender_email)));

alter table public.leads alter column company_id set not null;
alter table public.lead_stages add column is_won boolean not null default false;
insert into public.lead_stages(code, label, sort_order, is_won)
select 'won', '수주', max(sort_order) + 10, true from public.lead_stages;
alter table public.lead_activities drop constraint lead_activities_kind_check,
  add check (kind in ('call', 'meeting', 'email', 'note', 'stage_change'));

create trigger companies_bump_row_version before update on public.companies
for each row execute function private.bump_row_version();
create trigger contacts_bump_row_version before update on public.contacts
for each row execute function private.bump_row_version();

alter table public.companies enable row level security;
alter table public.contacts enable row level security;
alter table public.contact_touches enable row level security;
revoke all on public.companies, public.contacts, public.contact_touches from public, anon, authenticated;
grant all on public.companies, public.contacts, public.contact_touches to service_role;

create function public.crm_directory_snapshot(p_user_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'members', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'display_name', display_name, 'role', role, 'active', active) order by created_at, id) from public.users where active), '[]'::jsonb),
    'stages', (select jsonb_agg(jsonb_build_object('id', id, 'label', label, 'won', is_won) order by sort_order) from public.lead_stages),
    'leads', coalesce((select jsonb_agg(to_jsonb(l) order by l.created_at desc, l.id) from public.leads l), '[]'::jsonb),
    'tasks', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc, t.id) from public.tasks t), '[]'::jsonb),
    'mails', coalesce((select jsonb_agg(to_jsonb(m) order by m.received_at desc, m.id) from (
      select id, row_version, company_name, sender_name, sender_email, subject, received_at, lead_id, contact_id, is_excluded
      from public.inbound_emails
    ) m), '[]'::jsonb),
    'activities', coalesce((select jsonb_agg(to_jsonb(a) order by a.occurred_at desc, a.id) from public.lead_activities a), '[]'::jsonb),
    'templates', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc, t.id) from public.mail_templates t where owner_user_id = p_user_id), '[]'::jsonb),
    'drafts', coalesce((select jsonb_agg(to_jsonb(d) order by d.updated_at desc, d.id) from public.mail_drafts d where owner_user_id = p_user_id), '[]'::jsonb),
    'settings', (select jsonb_build_object('work_email', work_email, 'row_version', row_version) from public.user_settings where user_id = p_user_id),
    'connection', (select jsonb_build_object('id', id, 'sync_status', sync_status, 'last_success_at', last_success_at, 'row_version', row_version)
      from public.mail_connections order by last_success_at desc nulls last, created_at desc, id limit 1),
    'companies', coalesce((select jsonb_agg(to_jsonb(c) order by c.name, c.id) from public.companies c), '[]'::jsonb),
    'contacts', coalesce((select jsonb_agg(to_jsonb(c) order by c.name, c.id) from public.contacts c), '[]'::jsonb),
    'touches', coalesce((select jsonb_agg(to_jsonb(t) order by t.occurred_at desc, t.id) from public.contact_touches t), '[]'::jsonb)
  );
$$;

create function public.crm_link_inquiry(p_mail_id uuid, p_version bigint, p_company_id uuid, p_contact_id uuid, p_company jsonb, p_contact jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  mail_row public.inbound_emails%rowtype;
  selected_company uuid := p_company_id;
  selected_contact uuid := p_contact_id;
begin
  select * into mail_row from public.inbound_emails where id = p_mail_id for update;
  if not found or mail_row.row_version <> p_version or mail_row.contact_id is not null or mail_row.is_excluded then
    raise exception 'concurrent_update' using errcode = '40001';
  end if;

  if selected_company is null then
    insert into public.companies(name, legal_number, business_number, website)
    values (p_company->>'name', p_company->>'legal_number', p_company->>'business_number', p_company->>'website')
    returning id into selected_company;
  end if;
  if selected_contact is null then
    insert into public.contacts(company_id, name, email, phone, position)
    values (selected_company, p_contact->>'name', p_contact->>'email', p_contact->>'phone', p_contact->>'position')
    returning id into selected_contact;
  elsif not exists (select 1 from public.contacts c where c.id = p_contact_id and c.company_id = p_company_id) then
    raise exception 'invalid_directory_contact' using errcode = '23514';
  end if;

  update public.inbound_emails set contact_id = selected_contact where id = p_mail_id;
  return selected_contact;
end;
$$;

create function public.crm_receive_inquiry(p_mailbox text, p_message_id text, p_thread_id text,
  p_sender_name text, p_sender_email text, p_company_name text, p_subject text, p_body text, p_received_at timestamptz)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  connection_id uuid;
begin
  insert into public.mail_connections (provider, external_account_id, mailbox_address, sync_status, last_success_at)
  values ('webhook', p_mailbox, p_mailbox, 'ready', now())
  on conflict (provider, external_account_id) do update set sync_status = 'ready', last_success_at = now()
  returning id into connection_id;

  insert into public.inbound_emails (mail_connection_id, external_message_id, external_thread_id, sender_name,
    sender_email, company_name, subject, body_text, received_at)
  values (connection_id, p_message_id, p_thread_id, p_sender_name, p_sender_email, p_company_name, p_subject, p_body, p_received_at)
  on conflict (mail_connection_id, external_message_id) do nothing;
end;
$$;

revoke all on function public.crm_directory_snapshot(uuid),
  public.crm_link_inquiry(uuid, bigint, uuid, uuid, jsonb, jsonb),
  public.crm_receive_inquiry(text, text, text, text, text, text, text, text, timestamptz),
  public.register_lead_from_email(uuid, uuid, text, text, text, text, text)
  from public, anon, authenticated;
revoke execute on function public.register_lead_from_email(uuid, uuid, text, text, text, text, text) from service_role;
grant execute on function public.crm_directory_snapshot(uuid),
  public.crm_link_inquiry(uuid, bigint, uuid, uuid, jsonb, jsonb),
  public.crm_receive_inquiry(text, text, text, text, text, text, text, text, timestamptz) to service_role;

notify pgrst, 'reload schema';

commit;
