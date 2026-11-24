begin;

insert into public.lead_stages (code, label, sort_order)
select 'lost', '로스트', max(sort_order) + 10 from public.lead_stages;

alter table public.leads add column loss_reason text;
alter table public.leads add check (
  loss_reason is null or (char_length(btrim(loss_reason)) between 1 and 2000)
);

create function private.enforce_lead_loss()
returns trigger language plpgsql set search_path = '' as $$
declare
  next_code text;
begin
  select code into next_code from public.lead_stages where id = new.stage_id;
  if next_code = 'lost' then
    if tg_op = 'INSERT' then
      raise exception 'invalid_loss_transition' using errcode = '23514';
    end if;
    if new.stage_id <> old.stage_id and exists (
      select 1 from public.lead_stages where id = old.stage_id and is_won
    ) then
      raise exception 'invalid_loss_transition' using errcode = '23514';
    end if;
    if new.loss_reason is null or new.loss_reason !~ '[^[:space:]]' then
      raise exception 'loss_reason_required' using errcode = '23514';
    end if;
    if new.stage_id = old.stage_id and new.loss_reason is distinct from old.loss_reason then
      raise exception 'invalid_loss_transition' using errcode = '23514';
    end if;
  else
    new.loss_reason := null;
  end if;
  return new;
end;
$$;

create trigger enforce_lead_loss before insert or update of stage_id, loss_reason on public.leads
for each row execute function private.enforce_lead_loss();

create function public.crm_mark_lead_lost(p_user_id uuid, p_id uuid, p_expected_version bigint, p_stage_id uuid, p_reason text)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare
  previous_stage uuid;
  previous_stage_label text;
  saved_version bigint;
begin
  if not exists (select 1 from public.users where id = p_user_id and active) then
    raise exception 'invalid_user' using errcode = '42501';
  end if;
  if not exists (select 1 from public.lead_stages where id = p_stage_id and code = 'lost') then
    raise exception 'invalid_loss_transition' using errcode = '23514';
  end if;
  if p_reason is null or p_reason !~ '[^[:space:]]' or char_length(btrim(p_reason)) > 2000 then
    raise exception 'loss_reason_required' using errcode = '23514';
  end if;

  select stage_id into previous_stage from public.leads
  where id = p_id and row_version = p_expected_version for update;
  if not found then
    raise exception 'concurrent_update' using errcode = '40001';
  end if;
  if previous_stage = p_stage_id then
    raise exception 'invalid_loss_transition' using errcode = '23514';
  end if;

  update public.leads set stage_id = p_stage_id, loss_reason = btrim(p_reason)
  where id = p_id returning row_version into saved_version;

  select label into previous_stage_label from public.lead_stages where id = previous_stage;
  insert into public.lead_activities (lead_id, author_user_id, kind, body, previous_stage_id, next_stage_id)
  values (p_id, p_user_id, 'stage_change', previous_stage_label || ' → 로스트' || chr(10) || '사유: ' || btrim(p_reason),
    previous_stage, p_stage_id);
  return saved_version;
end;
$$;

create function public.crm_lifecycle_snapshot(p_user_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select public.crm_directory_snapshot(p_user_id) || jsonb_build_object('stages',
    (select jsonb_agg(jsonb_build_object('id', id, 'label', label, 'won', is_won, 'lost', code = 'lost') order by sort_order)
    from public.lead_stages));
$$;

revoke all on function public.crm_mark_lead_lost(uuid, uuid, bigint, uuid, text),
  public.crm_lifecycle_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.crm_mark_lead_lost(uuid, uuid, bigint, uuid, text),
  public.crm_lifecycle_snapshot(uuid) to service_role;

notify pgrst, 'reload schema';

commit;
