# Ronda 3, Parte 1 (Miguel): lo que quedó pendiente

Lo que las fases 15–18 de [`fases-siguientes-3.md`](fases-siguientes-3.md)
piden y que la rama `r3-parte-1` **no** pudo cerrar, con el motivo. Todo lo
demás de esas fases está hecho y probado (ver el commit de cada fase).

## Fase 15

- **Prueba de integración final de la ronda 2** (contrato 5 de
  `fases-siguientes-2.md`): es de los dos y se corre con el stack completo
  levantado, de punta a punta en el navegador. No se hizo en esta rama.
- **Pruebas de la Parte 2** (cola fiscal, plataforma, correo, `/sync`): son de
  Dikersson.
- Para dejar `oxlint` en 0 se tocaron dos archivos compartidos o de la Parte 2:
  `frontend/src/App.tsx` (solo cambia la ruta de import de `AuthProvider` y
  `SedeProvider`) y `frontend/src/offline/useColaOffline.ts` (la carga inicial
  de la cola). Hay que avisarlo en el PR.

## Fase 16

- **Archivos de la Parte 2 tocados** (el documento dice que la Parte 1
  coordina el contrato de `/sync`): `backend/src/sync/` (DTO, servicio,
  controlador y módulo). El contrato quedó así:
  - `pedidos` sigue igual y ahora es opcional; `pagos` es un arreglo aparte.
    Entre los dos tiene que venir al menos un elemento.
  - La respuesta sigue siendo un solo arreglo `CREADO | DUPLICADO | RECHAZADO`:
    primero los pedidos y después los pagos.
  - Roles: MESERO solo manda pedidos, CAJERO solo pagos y ADMIN ambos (403 si
    no).
- **Verificación en el navegador pendiente.** El backend tiene pruebas de
  integración (`test/cobro-offline.spec.ts`) y una prueba de humo de los
  endpoints con la app arrancada. Falta probar la caja con el modo avión en el
  navegador: cobrar sin red, ver el recibo provisional y ver que el cobro
  aparece al volver la red.
- **Huecos en la numeración.** Un bloque que una caja reservó y no alcanzó a
  usar deja esos números sin emitir (`// DECISIÓN DE PROTOTIPO`, bloques de
  20). Con la DIAN real habría que reportarlos o anularlos (TODO PRODUCCIÓN,
  fuera de alcance).
- **Cobro offline de un pedido que cocina no ha marcado LISTO.** La caja solo
  ofrece cobrar los pedidos que vio en LISTO por última vez. Si al sincronizar
  el pedido no está LISTO (o ya lo cobró otra caja), el cobro se rechaza y se
  le muestra al cajero para que lo resuelva a mano.

## Fase 17

- **Decisión que falta confirmar con el equipo** (el documento la deja
  abierta): un usuario con `sedeId` solo opera en esa sede; sin sede (el ADMIN)
  opera en todas. En el seed, cajero y mesero quedan en la Sede Centro.
- **Sin política RLS por sede**: el filtro es solo de aplicación
  (`auth/sede-usuario.ts`), encima del de cadena. El documento la deja como
  opcional ("si se quiere").
- **Endpoints de la Parte 2 sin el filtro por sede**: ~~`GET
  /documentos-fiscales/:id/xml`~~ (resuelto: `fiscal.controller.ts` ya llama
  a `verificarSedeDelUsuario`) y `POST /correo/resumen-diario` (`mail/`, solo
  ADMIN, que opera sobre toda la cadena).
- ~~**Tokens viejos**~~ (resuelto): rol y sede ya no salen del JWT sino de la
  base en cada petición (`auth/usuario-vigente.ts`), así que un token viejo
  queda restringido de inmediato.
- ~~**No hay pantalla para asignar la sede**~~ (resuelto): `/usuarios` (solo
  ADMIN, `UsersModule`) crea usuarios y les asigna sede, rol y estado.

## Fase 18

Hecho solo en el repo: todavía no hay cuenta de AWS y el documento pide no
crear recursos sin confirmarlo. La lista de lo que falta correr en AWS está en
[`datos-aws.md`](datos-aws.md#pendiente-en-aws). Además:

- ~~**Pedido a la Parte 2:** guardar los XML fiscales con el prefijo `fiscal/`~~
  (resuelto: el worker usa `DOCUMENTOS_PREFIJO_FISCAL`, por defecto `fiscal/`,
  en `fiscal/procesador-fiscal.service.ts`). Detalle en `datos-aws.md`,
  sección 4.
- **`docker-compose.prod.yml` (Fase 17B, Parte 2):** tiene que incluir los
  servicios `migrar` y `respaldo`. En la beta, `respaldo` no depende de
  `minio`.
- **Archivos compartidos o de la Parte 2 tocados:** `docker-compose.yml`
  (servicios `migrar` y `respaldo`; backend y worker ya no migran al
  arrancar), `.env.example` (variables nuevas al final) y `README.md` (se
  corrigió la frase que decía que las migraciones corren al arrancar el
  backend y se agregó un enlace).
- **Herramienta nueva:** `aws-cli` (paquete de Alpine) dentro de la imagen
  `respaldo`. Es una herramienta de operación, no una librería del backend,
  pero `CLAUDE.md` pide consultarlo: confirmar con el equipo.
- **No se probó `docker compose up` completo con esta rama**, porque el stack
  que corre en esta máquina es otro clon (`Comanda Proyecto\Comanda`) con el
  mismo nombre de proyecto y los mismos `container_name`. Sí se validó con
  `docker compose config`, y `migrar`, `respaldo` y el seed se probaron como
  contenedores sueltos contra la base `comanda_r3p1`. Antes de integrar hay
  que correr `docker compose up -d --wait` con esta rama.

## Integración con `r3-parte-2` (27/10/2026)

`r3-parte-1` se integró con `main` (que ya traía `r3-parte-2`, PR #8). Lo que
eso cerró o cambió de lo de arriba:

- **Fase 15:** la prueba de integración final y las pruebas de la Parte 2 ya
  existen (`backend/scripts/prueba-integracion.mjs`, CI de la Fase 18B). Con
  las dos partes juntas pasan: `docker compose up -d --build --wait`, seed,
  89/89 pruebas del backend, `tsc`, `oxlint` en backend y frontend, `npm run
  build` y `prueba-integracion.mjs` por Nginx (`TODO OK`).
- **Las dos partes arreglaron el mismo lint:** se quedaron `AuthProvider.tsx`
  y `SedeProvider.tsx` (Parte 1, traen la sede asignada de la Fase 17) y
  `hooks/useUltimoValor` en los sockets y la guarda `vigente` de
  `useColaOffline` (Parte 2).
- **Inventario al pedir (Parte 2):** el descuento pasó a la creación del
  pedido. `PaymentsService.registrarCobro` (lo comparten el cobro en línea y
  el sincronizado de la Fase 16) ahora usa `descontarSiFalta`, así que un
  cobro offline tampoco descuenta dos veces.
  `test/cobro-inventario.spec.ts` quedó cubriendo los pedidos sin `SALIDA`
  previa.
- **`sync.service.spec.ts` (Parte 2)** se adaptó a la firma nueva de
  `SyncService.aplicar` (`{ pedidos, pagos }` + usuario del JWT).
- **Fase 18 en la beta:** `docker-compose.prod.yml` ya traía `migrate` con
  `configurar-rol-app`. Se agregó el servicio `respaldo` (siempre activo, sin
  MinIO, logs a CloudWatch con `docker-compose.prod.aws.yml`), su imagen
  `comanda-respaldo` al workflow de despliegue, las variables en
  `.env.prod.example` (`AMBIENTE=beta`, `RESPALDO_*`) y el bucket
  `BUCKET_RESPALDOS` en la política de IAM de la EC2.
- **El `docker compose up` completo ya se probó** con la rama integrada, y un
  `respaldar` subió el `.dump` a MinIO.

Sigue pendiente: probar en el navegador la caja en modo avión (Fase 16) y lo
que falta correr en AWS (lista en [`datos-aws.md`](datos-aws.md#pendiente-en-aws)).
El prefijo `fiscal/` de los XML y el filtro por sede en `GET
/documentos-fiscales/:id/xml` ya están resueltos.
`docs/despliegue-aws.md` recomienda no correr el seed en la beta aunque
`AMBIENTE=beta` lo permite.
