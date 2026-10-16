-- Jalankan sekali di Supabase SQL Editor pada project baru.
create table public.profiles(id uuid primary key references auth.users(id) on delete cascade,full_name text not null default 'Siswa',role text not null default 'student' check(role in('admin','student')),class_name text not null default 'XI.A5',created_at timestamptz not null default now());
create table public.announcements(id bigint generated always as identity primary key,title text not null,content text not null,created_at timestamptz not null default now());
create table public.tasks(id bigint generated always as identity primary key,title text not null,description text not null default '',due_date timestamptz,class_name text not null default 'XI.A5',created_at timestamptz not null default now());
create table public.task_completions(id bigint generated always as identity primary key,task_id bigint not null references public.tasks(id) on delete cascade,student_id uuid not null references auth.users(id) on delete cascade,completed boolean not null default false,created_at timestamptz not null default now(),unique(task_id,student_id));
alter table public.profiles enable row level security; alter table public.announcements enable row level security; alter table public.tasks enable row level security; alter table public.task_completions enable row level security;
create policy "Read own profile" on public.profiles for select to authenticated using(id=auth.uid());
create policy "Read announcements" on public.announcements for select to authenticated using(true);
create policy "Read class tasks" on public.tasks for select to authenticated using(class_name=(select p.class_name from public.profiles p where p.id=auth.uid()));
create policy "Read own completions" on public.task_completions for select to authenticated using(student_id=auth.uid());
create policy "Add own completions" on public.task_completions for insert to authenticated with check(student_id=auth.uid());
create policy "Update own completions" on public.task_completions for update to authenticated using(student_id=auth.uid()) with check(student_id=auth.uid());
create policy "Admin creates announcements" on public.announcements for insert to authenticated with check(exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'));
create policy "Admin updates announcements" on public.announcements for update to authenticated using(exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin')) with check(exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'));
create policy "Admin deletes announcements" on public.announcements for delete to authenticated using(exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'));
create policy "Admin creates tasks" on public.tasks for insert to authenticated with check(exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'));
create policy "Admin updates tasks" on public.tasks for update to authenticated using(exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin')) with check(exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'));
create policy "Admin deletes tasks" on public.tasks for delete to authenticated using(exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'));
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$ begin insert into public.profiles(id,full_name,role,class_name) values(new.id,coalesce(new.raw_user_meta_data->>'full_name',split_part(new.email,'@',1),'Siswa'),'student',coalesce(new.raw_user_meta_data->>'class_name','XI.A5')); return new; end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();
-- Setelah mengundang akun admin, jadikan admin dengan UUID akun tersebut:
-- update public.profiles set role='admin', full_name='Admin XI.A5' where id='UUID-AKUN-ADMIN';