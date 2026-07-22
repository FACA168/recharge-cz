-- 充值中心 · Supabase 数据库结构
-- 用法：Supabase → SQL Editor → 粘贴全部 → Run

create table if not exists public.settings (
  id                   int primary key check (id = 1),
  site_name           text not null default '充值中心',
  logo                text default '',
  banner              text default '',
  announcement        text default '欢迎使用充值服务，代金券限量发放中！',
  wechat_qr           text default '',
  alipay_qr           text default '',
  cs_name             text default '在线客服',
  cs_link             text default '#',
  admin_password      text not null default '',
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

insert into public.settings (id, site_name, announcement, cs_name, cs_link, admin_password)
values (1, '充值中心', '欢迎使用充值服务，代金券限量发放中！', '在线客服', '#', '')
on conflict (id) do nothing;

create table if not exists public.vouchers (
  id          bigint generated always as identity primary key,
  phone       text not null unique,
  code        text not null unique,
  status      text not null default 'active',
  created_at  timestamptz default now()
);
create index if not exists idx_vouchers_phone on public.vouchers (phone);

create table if not exists public.orders (
  id                 text primary key,
  phone              text not null,
  contact            text default '',
  voucher_code       text default '',
  recharge_amount    numeric not null,
  voucher_discount   numeric not null default 0,
  actual_pay         numeric not null,
  payment_method     text default 'wechat',
  payment_screenshot text default '',
  status             text not null default 'processing',
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);
create index if not exists idx_orders_phone on public.orders (phone);
create index if not exists idx_orders_created on public.orders (created_at desc);

create or replace function public.touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_settings_updated on public.settings;
create trigger trg_settings_updated before update on public.settings
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_orders_updated on public.orders;
create trigger trg_orders_updated before update on public.orders
  for each row execute function public.touch_updated_at();

alter table public.settings enable row level security;
alter table public.vouchers enable row level security;
alter table public.orders   enable row level security;

drop policy if exists "settings_public_read" on public.settings;
create policy "settings_public_read" on public.settings for select using (true);

drop policy if exists "vouchers_no_anon" on public.vouchers;
create policy "vouchers_no_anon" on public.vouchers for all using (false);

drop policy if exists "orders_no_anon" on public.orders;
create policy "orders_no_anon" on public.orders for all using (false);
