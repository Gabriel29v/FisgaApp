create table if not exists public.perfis (
  id uuid primary key references auth.users (id) on delete cascade,
  nome_usuario text not null check (char_length(nome_usuario) between 2 and 40),
  criado_em timestamptz not null default now()
);

create table if not exists public.salas (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('direta', 'grupo')),
  nome text,
  criada_por uuid not null references auth.users (id) on delete restrict,
  criada_em timestamptz not null default now(),
  usuario_direto_a uuid references auth.users (id) on delete cascade,
  usuario_direto_b uuid references auth.users (id) on delete cascade,
  constraint salas_diretas_validas check (
    (tipo = 'direta'
      and nome is null
      and usuario_direto_a is not null
      and usuario_direto_b is not null
      and usuario_direto_a < usuario_direto_b)
    or
    (tipo = 'grupo'
      and nome is not null
      and char_length(trim(nome)) between 2 and 50
      and usuario_direto_a is null
      and usuario_direto_b is null)
  )
);

create unique index if not exists salas_conversa_direta_unica
  on public.salas (usuario_direto_a, usuario_direto_b)
  where tipo = 'direta';

create table if not exists public.salas_membros (
  sala_id uuid not null references public.salas (id) on delete cascade,
  usuario_id uuid not null references auth.users (id) on delete cascade,
  entrou_em timestamptz not null default now(),
  primary key (sala_id, usuario_id)
);

create table if not exists public.mensagens (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users (id) on delete restrict,
  nome_usuario text not null,
  conteudo text not null check (char_length(trim(conteudo)) between 1 and 1000),
  criado_em timestamptz not null default now(),
  sala_id uuid not null references public.salas (id) on delete cascade
);

create index if not exists mensagens_sala_criado_em_idx
  on public.mensagens (sala_id, criado_em);

create table if not exists public.amizades (
  id uuid primary key default gen_random_uuid(),
  solicitante_id uuid not null references auth.users (id) on delete cascade,
  destinatario_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pendente' check (status in ('pendente', 'aceita')),
  criada_em timestamptz not null default now(),
  constraint amizades_usuarios_diferentes check (solicitante_id <> destinatario_id)
);

create unique index if not exists amizades_par_unico
  on public.amizades (least(solicitante_id, destinatario_id), greatest(solicitante_id, destinatario_id));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'fisga-capturas',
  'fisga-capturas',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.criar_perfil_fisga()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  perfil_nome text;
begin
  perfil_nome := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'nome_usuario'), ''),
    split_part(new.email, '@', 1),
    'Pescador'
  );

  insert into public.perfis (id, nome_usuario)
  values (new.id, left(perfil_nome, 40))
  on conflict (id) do update
    set nome_usuario = excluded.nome_usuario;

  return new;
end;
$$;

drop trigger if exists fisga_criar_perfil_insert on auth.users;
create trigger fisga_criar_perfil_insert
  after insert on auth.users
  for each row execute function public.criar_perfil_fisga();

drop trigger if exists fisga_criar_perfil_update on auth.users;
create trigger fisga_criar_perfil_update
  after update of raw_user_meta_data, email on auth.users
  for each row execute function public.criar_perfil_fisga();

create or replace function public.preencher_autor_mensagem()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.usuario_id := auth.uid();
  select perfis.nome_usuario
    into new.nome_usuario
    from public.perfis
    where perfis.id = auth.uid();

  if new.nome_usuario is null then
    raise exception 'O perfil do pescador não foi encontrado.';
  end if;

  return new;
end;
$$;

drop trigger if exists fisga_preencher_autor_mensagem on public.mensagens;
create trigger fisga_preencher_autor_mensagem
  before insert on public.mensagens
  for each row execute function public.preencher_autor_mensagem();

create or replace function public.e_membro_da_sala(p_sala_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.salas_membros
      where salas_membros.sala_id = p_sala_id
        and salas_membros.usuario_id = (select auth.uid())
  );
$$;

create or replace function public.criar_sala_grupo(p_nome text, p_membros uuid[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  sala_nova_id uuid;
  membros uuid[];
begin
  if auth.uid() is null then
    raise exception 'É necessário entrar na conta.';
  end if;
  if p_nome is null or char_length(trim(p_nome)) not between 2 and 50 then
    raise exception 'O nome do grupo deve ter entre 2 e 50 caracteres.';
  end if;

  select coalesce(array_agg(distinct dados.membro), array[]::uuid[])
    into membros
    from unnest(coalesce(p_membros, array[]::uuid[])) as dados(membro)
    where dados.membro is not null;
  membros := array_append(membros, auth.uid());
  select array_agg(distinct dados.membro)
    into membros
    from unnest(membros) as dados(membro);

  if cardinality(membros) < 2 or cardinality(membros) > 20 then
    raise exception 'Um grupo precisa ter de 2 a 20 participantes.';
  end if;

  insert into public.salas (tipo, nome, criada_por)
    values ('grupo', trim(p_nome), auth.uid())
    returning id into sala_nova_id;

  insert into public.salas_membros (sala_id, usuario_id)
    select sala_nova_id, dados.membro from unnest(membros) as dados(membro);

  return sala_nova_id;
end;
$$;

create or replace function public.obter_ou_criar_conversa_direta(p_outro_usuario uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  usuario_a uuid;
  usuario_b uuid;
  sala_nova_id uuid;
begin
  if auth.uid() is null then
    raise exception 'É necessário entrar na conta.';
  end if;
  if p_outro_usuario is null or p_outro_usuario = auth.uid() then
    raise exception 'Escolha outro pescador para iniciar uma conversa.';
  end if;

  usuario_a := least(auth.uid(), p_outro_usuario);
  usuario_b := greatest(auth.uid(), p_outro_usuario);

  insert into public.salas (tipo, criada_por, usuario_direto_a, usuario_direto_b)
    values ('direta', auth.uid(), usuario_a, usuario_b)
    on conflict (usuario_direto_a, usuario_direto_b) where tipo = 'direta' do nothing
    returning id into sala_nova_id;

  if sala_nova_id is null then
    select id into sala_nova_id
      from public.salas
      where tipo = 'direta'
        and usuario_direto_a = usuario_a
        and usuario_direto_b = usuario_b;
  end if;

  insert into public.salas_membros (sala_id, usuario_id)
    values (sala_nova_id, usuario_a), (sala_nova_id, usuario_b)
    on conflict do nothing;

  return sala_nova_id;
end;
$$;

create or replace function public.solicitar_amizade(p_outro_usuario uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  solicitacao public.amizades%rowtype;
begin
  if auth.uid() is null then
    raise exception 'É necessário entrar na conta.';
  end if;
  if p_outro_usuario is null or p_outro_usuario = auth.uid() then
    raise exception 'Escolha outro pescador para adicionar como amigo.';
  end if;
  if not exists (select 1 from public.perfis where id = p_outro_usuario) then
    raise exception 'Esse perfil de pescador não foi encontrado.';
  end if;

  insert into public.amizades (solicitante_id, destinatario_id)
    values (auth.uid(), p_outro_usuario)
    on conflict do nothing;

  select *
    into solicitacao
    from public.amizades
    where least(solicitante_id, destinatario_id) = least(auth.uid(), p_outro_usuario)
      and greatest(solicitante_id, destinatario_id) = greatest(auth.uid(), p_outro_usuario)
    for update;

  if solicitacao.status = 'pendente' and solicitacao.solicitante_id <> auth.uid() then
    update public.amizades
      set status = 'aceita'
      where id = solicitacao.id;
    return 'aceita';
  end if;

  return solicitacao.status;
end;
$$;

create or replace function public.responder_solicitacao_amizade(p_outro_usuario uuid, p_aceitar boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  linhas_alteradas integer;
begin
  if auth.uid() is null then
    raise exception 'É necessário entrar na conta.';
  end if;
  if p_outro_usuario is null or p_outro_usuario = auth.uid() then
    raise exception 'A solicitação de amizade não é válida.';
  end if;

  if p_aceitar then
    update public.amizades
      set status = 'aceita'
      where solicitante_id = p_outro_usuario
        and destinatario_id = auth.uid()
        and status = 'pendente';
  else
    delete from public.amizades
      where solicitante_id = p_outro_usuario
        and destinatario_id = auth.uid()
        and status = 'pendente';
  end if;
  get diagnostics linhas_alteradas = row_count;

  if linhas_alteradas = 0 then
    raise exception 'A solicitação não existe ou já foi respondida.';
  end if;
end;
$$;

create or replace function public.remover_amizade(p_outro_usuario uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  linhas_removidas integer;
begin
  if auth.uid() is null then
    raise exception 'É necessário entrar na conta.';
  end if;
  if p_outro_usuario is null or p_outro_usuario = auth.uid() then
    raise exception 'O pescador selecionado não é válido.';
  end if;

  delete from public.amizades
    where (
      (solicitante_id = auth.uid() and destinatario_id = p_outro_usuario)
      or (solicitante_id = p_outro_usuario and destinatario_id = auth.uid())
    )
    and (status = 'aceita' or solicitante_id = auth.uid());
  get diagnostics linhas_removidas = row_count;

  if linhas_removidas = 0 then
    raise exception 'A amizade ou solicitação não foi encontrada.';
  end if;
end;
$$;

alter table public.perfis enable row level security;
alter table public.salas enable row level security;
alter table public.salas_membros enable row level security;
alter table public.mensagens enable row level security;
alter table public.amizades enable row level security;

drop policy if exists "Membros podem ver perfis da comunidade" on public.perfis;
create policy "Membros podem ver perfis da comunidade"
  on public.perfis for select to authenticated
  using (auth.uid() is not null);

drop policy if exists "Pescador pode atualizar o próprio perfil" on public.perfis;
create policy "Pescador pode atualizar o próprio perfil"
  on public.perfis for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists "Membros podem ver suas salas" on public.salas;
create policy "Membros podem ver suas salas"
  on public.salas for select to authenticated
  using (public.e_membro_da_sala(id));

drop policy if exists "Membros podem ver participantes da sala" on public.salas_membros;
create policy "Membros podem ver participantes da sala"
  on public.salas_membros for select to authenticated
  using (public.e_membro_da_sala(sala_id));

drop policy if exists "Membros podem ler mensagens da sala" on public.mensagens;
create policy "Membros podem ler mensagens da sala"
  on public.mensagens for select to authenticated
  using (public.e_membro_da_sala(sala_id));

drop policy if exists "Membros podem enviar mensagens na sala" on public.mensagens;
create policy "Membros podem enviar mensagens na sala"
  on public.mensagens for insert to authenticated
  with check (
    usuario_id = (select auth.uid())
    and public.e_membro_da_sala(sala_id)
  );

drop policy if exists "Pescadores podem ver suas amizades" on public.amizades;
create policy "Pescadores podem ver suas amizades"
  on public.amizades for select to authenticated
  using (auth.uid() = solicitante_id or auth.uid() = destinatario_id);

drop policy if exists "Fotos de capturas são públicas" on storage.objects;
create policy "Fotos de capturas são públicas"
  on storage.objects for select to public
  using (bucket_id = 'fisga-capturas');

drop policy if exists "Pescador envia suas próprias fotos" on storage.objects;
create policy "Pescador envia suas próprias fotos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'fisga-capturas'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Pescador apaga suas próprias fotos" on storage.objects;
create policy "Pescador apaga suas próprias fotos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'fisga-capturas'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

revoke all on function public.e_membro_da_sala(uuid) from public, anon;
grant execute on function public.e_membro_da_sala(uuid) to authenticated;

revoke all on function public.criar_sala_grupo(text, uuid[]) from public, anon;
grant execute on function public.criar_sala_grupo(text, uuid[]) to authenticated;

revoke all on function public.obter_ou_criar_conversa_direta(uuid) from public, anon;
grant execute on function public.obter_ou_criar_conversa_direta(uuid) to authenticated;

revoke all on function public.solicitar_amizade(uuid) from public, anon;
grant execute on function public.solicitar_amizade(uuid) to authenticated;

revoke all on function public.responder_solicitacao_amizade(uuid, boolean) from public, anon;
grant execute on function public.responder_solicitacao_amizade(uuid, boolean) to authenticated;

revoke all on function public.remover_amizade(uuid) from public, anon;
grant execute on function public.remover_amizade(uuid) to authenticated;

grant select, update on public.perfis to authenticated;
grant select on public.salas, public.salas_membros to authenticated;
grant select, insert on public.mensagens to authenticated;
grant select on public.amizades to authenticated;
revoke all on public.perfis, public.salas, public.salas_membros, public.mensagens, public.amizades from anon;

do $$
begin
  if not exists (
    select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'mensagens'
  ) then
    execute 'alter publication supabase_realtime add table public.mensagens';
  end if;
end;
$$;
