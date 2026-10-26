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
