import type { PrismaService } from '../prisma/prisma.service.js';
import type { JwtPayload, UsuarioAutenticado } from './jwt-payload.interface.js';

// Gestión de usuarios (/usuarios): el ADMIN puede cambiar la sede o el rol de
// un usuario, o desactivarlo, mientras ese usuario tiene un JWT vigente. Si
// solo se leyera el token, el cambio no aplicaría hasta el próximo login (y un
// usuario desactivado seguiría operando hasta que expire). Por eso rol y sede
// salen de la base en cada petición REST y en el handshake del WebSocket.
// Devuelve null si el usuario ya no existe, está inactivo o cambió de cadena.
//
// DECISIÓN DE PROTOTIPO: una consulta por llave primaria por petición. En
// producción se cachearía (p. ej. en Redis, invalidando al editar el usuario)
// o se usarían tokens cortos con refresh.
export async function cargarUsuarioVigente(
  prisma: PrismaService,
  payload: JwtPayload,
): Promise<UsuarioAutenticado | null> {
  const usuario = await prisma.conCadena(payload.cadenaId, (tx) =>
    tx.usuario.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, rol: true, cadenaId: true, sedeId: true, activo: true },
    }),
  );
  if (!usuario || !usuario.activo || usuario.cadenaId !== payload.cadenaId) {
    return null;
  }
  return {
    userId: usuario.id,
    email: usuario.email,
    rol: usuario.rol,
    cadenaId: usuario.cadenaId,
    sedeId: usuario.sedeId,
  };
}
