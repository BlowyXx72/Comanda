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
- **Endpoints de la Parte 2 sin el filtro por sede**: `GET
  /documentos-fiscales/:id/xml` (`fiscal/`) y `POST /correo/resumen-diario`
  (`mail/`, solo ADMIN). El del XML conviene agregarlo en la Parte 2 con
  `verificarSedeDelUsuario`.
- **Tokens viejos**: un JWT emitido antes de la Fase 17 no trae `sedeId` y no
  queda restringido hasta que la sesión vence (8 h) o se vuelve a iniciar.
- **No hay pantalla para asignar la sede**: se asigna en el seed o directo en
  la base, igual que los usuarios (no hay gestión de usuarios, ver CLAUDE.md).
