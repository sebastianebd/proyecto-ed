-- RLS idempotente (docs/03-seguridad.md §5). Se aplica vía `npm run db:migrate`.
-- La app accede con el rol dueño de la BD (bypass RLS); `anon` no recibe ningún acceso.

-- Rol `anon`: existe en Supabase; se crea localmente solo si falta para poder probar la denegación.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
END
$$;

-- Activar RLS en el 100% de las tablas del esquema public (sin políticas => denegación total).
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END
$$;

-- Revocar cualquier privilegio heredado al rol anónimo sobre tablas y secuencias existentes.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
