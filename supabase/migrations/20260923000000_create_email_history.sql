create table public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Untitled campaign',
  sender_email text,
  subject_template text not null,
  body_template text not null,
  status text not null default 'draft'
    check (status in (
      'draft',
      'scheduled',
      'sending',
      'completed',
      'completed_with_errors',
      'cancelled',
      'failed'
    )),
  scheduled_at timestamptz,
  scheduled_timezone text,
  total_count integer not null default 0 check (total_count >= 0),
  sent_count integer not null default 0 check (sent_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_campaigns_id_user_unique unique (id, user_id),
  constraint email_campaigns_counts_valid check (
    sent_count + failed_count <= total_count
  )
);

create table public.email_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_row_number integer check (source_row_number is null or source_row_number > 0),
  email_address text not null,
  recipient_name text,
  merge_data jsonb not null default '{}'::jsonb,
  rendered_subject text,
  rendered_body text,
  status text not null default 'queued'
    check (status in ('queued', 'sending', 'sent', 'failed', 'cancelled')),
  gmail_message_id text,
  error_message text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint email_recipients_campaign_user_fk
    foreign key (campaign_id, user_id)
    references public.email_campaigns(id, user_id)
    on delete cascade,
  constraint email_recipients_campaign_row_unique
    unique (campaign_id, source_row_number)
);

create index email_campaigns_user_created_idx
  on public.email_campaigns (user_id, created_at desc);

create index email_campaigns_scheduled_idx
  on public.email_campaigns (status, scheduled_at)
  where status = 'scheduled';

create index email_recipients_campaign_idx
  on public.email_recipients (campaign_id);

create index email_recipients_user_idx
  on public.email_recipients (user_id);

create index email_recipients_status_idx
  on public.email_recipients (campaign_id, status);

create function public.set_email_campaign_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

create trigger set_email_campaigns_updated_at
before update on public.email_campaigns
for each row
execute function public.set_email_campaign_updated_at();

alter table public.email_campaigns enable row level security;
alter table public.email_recipients enable row level security;

revoke all on table public.email_campaigns from anon, authenticated;
revoke all on table public.email_recipients from anon, authenticated;

grant select, insert, update, delete
  on table public.email_campaigns to authenticated;
grant select, insert, update, delete
  on table public.email_recipients to authenticated;

create policy "Users can read their own campaigns"
on public.email_campaigns
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their own campaigns"
on public.email_campaigns
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own campaigns"
on public.email_campaigns
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own campaigns"
on public.email_campaigns
for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can read their own recipients"
on public.email_recipients
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their own recipients"
on public.email_recipients
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own recipients"
on public.email_recipients
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own recipients"
on public.email_recipients
for delete
to authenticated
using ((select auth.uid()) = user_id);
