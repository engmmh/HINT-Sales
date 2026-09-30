-- =====================================================================
-- موقع تقارير المناديب - شركة أفق الحروف التجارية
-- كل الكائنات هنا بادئتها hm_ (جداول، دوال، Views، سياسات، مخزن الصور)
-- السكريبت "إنشاء فقط": لا يعدّل ولا يمسح أي جدول أو بيانات موجودة.
-- شغّله مرة واحدة من Supabase > SQL Editor.
-- =====================================================================

-- ---------- 1) المستخدمون المسموح لهم بالدخول للموقع ----------
create table if not exists public.hm_users (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  name       text not null,
  role       text not null default 'rep' check (role in ('rep','manager')),
  created_at timestamptz not null default now()
);

-- دالة تتحقق أن المستخدم الحالي مسجل في موقع التقارير فقط
create or replace function public.hm_is_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.hm_users u where u.user_id = auth.uid());
$$;

-- ---------- 2) البيانات الأساسية ----------
create table if not exists public.hm_brands (
  id         bigint generated always as identity primary key,
  name       text not null unique,
  logo_path  text,                       -- مسار الشعار داخل مخزن hm-photos
  created_at timestamptz not null default now()
);

create table if not exists public.hm_products (
  id         bigint generated always as identity primary key,
  brand_id   bigint not null references public.hm_brands(id),
  name       text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (brand_id, name)
);

create table if not exists public.hm_stores (
  id         bigint generated always as identity primary key,
  name       text not null,
  branch     text not null default '',
  city       text,
  notes      text,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (name, branch)
);

-- ---------- 3) الاستلام من المصنع (بالبوكس) ----------
create table if not exists public.hm_receipts (
  id           bigint generated always as identity primary key,
  receipt_date date not null,
  product_id   bigint not null references public.hm_products(id),
  expiry_date  date not null,
  boxes        numeric(10,2) not null check (boxes > 0),
  notes        text,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now()
);
create index if not exists hm_receipts_date_idx on public.hm_receipts(receipt_date);

-- ---------- 4) التوزيع على المحلات ----------
create table if not exists public.hm_distributions (
  id        bigint generated always as identity primary key,
  dist_date date not null,
  store_id  bigint not null references public.hm_stores(id),
  notes     text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists hm_dist_date_idx on public.hm_distributions(dist_date);

create table if not exists public.hm_distribution_items (
  id              bigint generated always as identity primary key,
  distribution_id bigint not null references public.hm_distributions(id) on delete cascade,
  product_id      bigint not null references public.hm_products(id),
  expiry_date     date not null,
  boxes           numeric(10,2) not null check (boxes > 0)
);
create index if not exists hm_dist_items_dist_idx on public.hm_distribution_items(distribution_id);

-- ---------- 5) الزيارات ----------
create table if not exists public.hm_visits (
  id         bigint generated always as identity primary key,
  visit_date date not null,
  store_id   bigint not null references public.hm_stores(id),
  notes      text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists hm_visits_date_idx on public.hm_visits(visit_date);

create table if not exists public.hm_visit_items (
  id              bigint generated always as identity primary key,
  visit_id        bigint not null references public.hm_visits(id) on delete cascade,
  product_id      bigint not null references public.hm_products(id),
  expiry_date     date not null,
  expected_boxes  numeric(10,2) not null default 0,   -- المتوقع حسب السجل
  remaining_boxes numeric(10,2) not null default 0,   -- الموجود فعليًا
  returned_boxes  numeric(10,2) not null default 0,   -- مرتجع
  damaged_boxes   numeric(10,2) not null default 0,   -- تالف
  sold_boxes      numeric(10,2) generated always as
                  (expected_boxes - remaining_boxes - returned_boxes - damaged_boxes) stored,
  note            text
);
create index if not exists hm_visit_items_visit_idx on public.hm_visit_items(visit_id);

create table if not exists public.hm_photos (
  id         bigint generated always as identity primary key,
  visit_id   bigint not null references public.hm_visits(id) on delete cascade,
  path       text not null,                 -- مسار الصورة داخل مخزن hm-photos
  created_at timestamptz not null default now()
);

-- ---------- 6) Views للمخزون ----------
-- مخزون عندي (المستلم - الموزَّع) لكل منتج وتاريخ صلاحية
create or replace view public.hm_stock
with (security_invoker = true) as
with r as (
  select product_id, expiry_date, sum(boxes) qty
  from public.hm_receipts group by 1,2
), d as (
  select product_id, expiry_date, sum(boxes) qty
  from public.hm_distribution_items group by 1,2
)
select coalesce(r.product_id, d.product_id)   as product_id,
       coalesce(r.expiry_date, d.expiry_date) as expiry_date,
       coalesce(r.qty, 0)                     as received,
       coalesce(d.qty, 0)                     as distributed,
       coalesce(r.qty, 0) - coalesce(d.qty, 0) as available
from r full join d
  on r.product_id = d.product_id and r.expiry_date = d.expiry_date;

-- الموجود حاليًا في كل محل (الموزَّع - ما خرج في الزيارات)
create or replace view public.hm_store_stock
with (security_invoker = true) as
with d as (
  select dd.store_id, di.product_id, di.expiry_date, sum(di.boxes) qty
  from public.hm_distribution_items di
  join public.hm_distributions dd on dd.id = di.distribution_id
  group by 1,2,3
), v as (
  select vv.store_id, vi.product_id, vi.expiry_date,
         sum(vi.expected_boxes - vi.remaining_boxes) qty
  from public.hm_visit_items vi
  join public.hm_visits vv on vv.id = vi.visit_id
  group by 1,2,3
)
select coalesce(d.store_id, v.store_id)       as store_id,
       coalesce(d.product_id, v.product_id)   as product_id,
       coalesce(d.expiry_date, v.expiry_date) as expiry_date,
       coalesce(d.qty, 0)                     as delivered,
       coalesce(v.qty, 0)                     as taken_out,
       coalesce(d.qty, 0) - coalesce(v.qty, 0) as current_boxes
from d full join v
  on d.store_id = v.store_id and d.product_id = v.product_id and d.expiry_date = v.expiry_date;

-- ---------- 7) الصلاحيات و RLS (على جداول hm_ فقط) ----------
do $$
declare t text;
begin
  foreach t in array array[
    'hm_users','hm_brands','hm_products','hm_stores','hm_receipts',
    'hm_distributions','hm_distribution_items','hm_visits','hm_visit_items','hm_photos'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    if t <> 'hm_users' then
      if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname='hm_member_all') then
        execute format(
          'create policy hm_member_all on public.%I for all to authenticated using (public.hm_is_member()) with check (public.hm_is_member())', t);
      end if;
    end if;
  end loop;
end $$;

-- المستخدم يقرأ صفّه فقط من hm_users
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='hm_users' and policyname='hm_users_self_select') then
    create policy hm_users_self_select on public.hm_users
      for select to authenticated using (user_id = auth.uid());
  end if;
end $$;
revoke insert, update, delete on public.hm_users from authenticated;

grant select on public.hm_stock, public.hm_store_stock to authenticated;
revoke all on public.hm_stock, public.hm_store_stock from anon;
grant execute on function public.hm_is_member() to authenticated;

-- ---------- 8) مخزن الصور (خاص) ----------
insert into storage.buckets (id, name, public)
values ('hm-photos', 'hm-photos', false)
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='hm_photos_member_all') then
    create policy hm_photos_member_all on storage.objects
      for all to authenticated
      using (bucket_id = 'hm-photos' and public.hm_is_member())
      with check (bucket_id = 'hm-photos' and public.hm_is_member());
  end if;
end $$;

-- ---------- 9) البراندات الأربعة ----------
insert into public.hm_brands (name) values ('M DEE'), ('HINT'), ('MLT'), ('KIB')
on conflict (name) do nothing;

-- =====================================================================
-- خطوة أخيرة بعد تشغيل السكريبت (مرة واحدة):
-- 1) Authentication > Users > Add user > Create new user
--      Email:    hm@example.com
--      Password: hm-9876-ufuq        (وفعّل Auto Confirm User)
--    (الموقع بيضيف hm- قبل كلمة السر و -ufuq بعدها تلقائيًا، فبتكتب 9876 بس عند الدخول)
-- 2) شغّل السطر ده لتسمح للحساب بدخول موقع التقارير (عدّل الاسم):
--
--   insert into public.hm_users (user_id, name, role)
--   select id, 'اكتب اسمك هنا', 'manager' from auth.users where email = 'hm@example.com'
--   on conflict do nothing;
-- =====================================================================
