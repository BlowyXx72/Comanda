-- DECISIÓN DE PROTOTIPO (Fase 12, §6.1): Row Level Security de Postgres como
-- segunda capa de aislamiento multi-tenant, debajo de los filtros por cadenaId
-- de la aplicación (que NO se quitan).
--
-- Cómo funciona: la aplicación abre cada operación de negocio con el rol
-- comanda_app (migración r2p1_rol_app) dentro de una transacción que ejecuta
-- set_config('app.cadena_id', <cadena del JWT>, true) (helper conCadena(), US-12-3).
-- Las políticas comparan contra esa variable. Sin variable (cadena vacía) no se
-- ve ni se escribe ninguna fila.
--
-- Tablas sin cadena_id directo (mesas, pedidos, pedido_detalles, pagos,
-- documentos_fiscales, movimientos_inventario, recetas): se decidió política con
-- EXISTS contra el padre (sedes / pedidos / productos) en vez de agregar una
-- columna cadena_id denormalizada. La propuesta dice que "todas las tablas de
-- negocio llevan cadena_id", y la columna sería lo más fiel, pero obligaría a
-- tocar cada INSERT (incluido el código de Parte 2: fiscal, integraciones) y a
-- mantener un campo redundante que podría desincronizarse del padre. Con EXISTS
-- el esquema de Prisma y todo el código de escritura quedan intactos, y la
-- cadena sigue derivándose de una única fuente (sedes.cadena_id / productos.cadena_id).
-- TODO PRODUCCIÓN: con volúmenes reales, denormalizar cadena_id (e indexarlo)
-- para evitar el subselect en cada fila.
--
-- FORCE ROW LEVEL SECURITY: aplica las políticas también al dueño de las tablas.
-- Pero el dueño (DATABASE_URL) corre el seed, configurar-rol-app y las
-- consultas previas a conocer la cadena (login por email, API key de plataforma),
-- que por naturaleza no tienen cadena. Por eso cada tabla lleva además una
-- política "dueno_total" solo para el rol que ejecuta esta migración; el rol
-- comanda_app nunca la cumple.

DO $$
DECLARE
  t text;
  dueno text := current_user;
  -- tabla -> expresión de la política (USING y WITH CHECK)
  politicas constant jsonb := '{
    "cadenas":                 "id = current_setting(''app.cadena_id'', true)",
    "sedes":                   "cadena_id = current_setting(''app.cadena_id'', true)",
    "usuarios":                "cadena_id = current_setting(''app.cadena_id'', true)",
    "productos":               "cadena_id = current_setting(''app.cadena_id'', true)",
    "clientes":                "cadena_id = current_setting(''app.cadena_id'', true)",
    "insumos":                 "cadena_id = current_setting(''app.cadena_id'', true)",
    "integraciones_plataforma":"cadena_id = current_setting(''app.cadena_id'', true)",
    "mesas":                   "EXISTS (SELECT 1 FROM sedes s WHERE s.id = sede_id)",
    "pedidos":                 "EXISTS (SELECT 1 FROM sedes s WHERE s.id = sede_id)",
    "documentos_fiscales":     "EXISTS (SELECT 1 FROM sedes s WHERE s.id = sede_id)",
    "movimientos_inventario":  "EXISTS (SELECT 1 FROM sedes s WHERE s.id = sede_id)",
    "pedido_detalles":         "EXISTS (SELECT 1 FROM pedidos p WHERE p.id = pedido_id)",
    "pagos":                   "EXISTS (SELECT 1 FROM pedidos p WHERE p.id = pedido_id)",
    "recetas":                 "EXISTS (SELECT 1 FROM productos pr WHERE pr.id = producto_id)"
  }';
BEGIN
  FOR t IN SELECT jsonb_object_keys(politicas) LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    -- FOR ALL cubre SELECT/INSERT/UPDATE/DELETE; USING filtra lecturas y
    -- filas existentes, WITH CHECK valida las filas nuevas o modificadas.
    EXECUTE format(
      'CREATE POLICY aislamiento_cadena ON %I FOR ALL TO comanda_app USING (%s) WITH CHECK (%s)',
      t, politicas ->> t, politicas ->> t);
    EXECUTE format(
      'CREATE POLICY dueno_total ON %I FOR ALL TO %I USING (true) WITH CHECK (true)',
      t, dueno);
  END LOOP;
END
$$;
