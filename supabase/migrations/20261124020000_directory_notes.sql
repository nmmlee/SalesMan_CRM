begin;

alter table public.companies add column notes text not null default '' check (char_length(notes) <= 4000);
alter table public.contacts add column notes text not null default '' check (char_length(notes) <= 4000);

alter table public.contact_touches drop constraint contact_touches_kind_check,
  add check (kind in ('통화', '미팅', '이메일', '메모') or (kind = '로스트 메모' and contact_id is not null));

notify pgrst, 'reload schema';

commit;
