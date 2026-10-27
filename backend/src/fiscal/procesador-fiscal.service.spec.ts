import { UnrecoverableError, type Job } from 'bullmq';
import type { ColaCorreoService } from '../mail/cola-correo.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { AlmacenObjetosService } from '../storage/almacen-objetos.service.js';
import type { ColaFiscalService } from './cola-fiscal.service.js';
import type { ResultadoFiscal, TrabajoFiscal } from './fiscal.types.js';
import { ProcesadorFiscalService } from './procesador-fiscal.service.js';
import { ProveedorDianNoDisponibleError, type ProveedorDianSimuladoService } from './proveedor-dian-simulado.service.js';

// Fase 15: el ciclo PENDIENTE → VALIDADO/RECHAZADO del worker fiscal, sin
// Redis ni base. Se llama directo a procesar() con dobles de cada dependencia.
const CADENA = 'cadena-1';

const documento = (sobrescribir: Record<string, unknown> = {}) => ({
  id: 'doc-1',
  pedidoId: 'pedido-1',
  sedeId: 'sede-1',
  consecutivo: 7,
  estadoDian: 'PENDIENTE',
  urlXml: null as string | null,
  mensajeDian: null as string | null,
  creadoEn: new Date('2026-10-20T15:00:00Z'),
  sede: { cadenaId: CADENA, nombre: 'Centro', rangoInicio: 1, rangoFin: 1000 },
  pedido: { canal: 'SALON', total: '20000', detalles: [] },
  ...sobrescribir,
});

function armar(doc: ReturnType<typeof documento> | null) {
  // La fila "en la base": cada update la modifica, como en Postgres.
  const fila = doc && { ...doc };
  const update = vi.fn(async ({ data }: { data: Record<string, unknown> }) => Object.assign(fila!, data));
  const prisma = {
    conCadena: vi.fn((_cadenaId: string, fn: (tx: unknown) => unknown) =>
      fn({ documentoFiscal: { findUnique: vi.fn(async () => fila && { ...fila }), update } }),
    ),
  };
  const almacen = { subir: vi.fn(async (llave: string) => `s3://bucket/${llave}`) };
  const proveedor = { validar: vi.fn() };
  const colaCorreo = { encolarComprobante: vi.fn(async () => undefined) };
  const servicio = new ProcesadorFiscalService(
    prisma as unknown as PrismaService,
    almacen as unknown as AlmacenObjetosService,
    proveedor as unknown as ProveedorDianSimuladoService,
    {} as ColaFiscalService,
    colaCorreo as unknown as ColaCorreoService,
  );
  const procesar = (intentosHechos = 0, intentos = 3) =>
    servicio['procesar']({
      data: { documentoFiscalId: 'doc-1', cadenaId: CADENA },
      attemptsMade: intentosHechos,
      opts: { attempts: intentos },
    } as Job<TrabajoFiscal, ResultadoFiscal>);
  return { procesar, update, almacen, proveedor, colaCorreo };
}

describe('ProcesadorFiscalService', () => {
  it('valida un documento PENDIENTE: sube el XML y guarda VALIDADO_SIMULADO', async () => {
    const { procesar, update, almacen, proveedor } = armar(documento());
    proveedor.validar.mockResolvedValue({ aceptado: true, mensaje: 'OK' });

    const resultado = await procesar();

    expect(almacen.subir).toHaveBeenCalledWith(`${CADENA}/sede-1/7-doc-1.xml`, expect.any(String), 'application/xml');
    expect(resultado.estadoDian).toBe('VALIDADO_SIMULADO');
    expect(resultado.urlXml).toBe(`s3://bucket/${CADENA}/sede-1/7-doc-1.xml`);
    expect(update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ estadoDian: 'VALIDADO_SIMULADO', mensajeDian: 'OK' }) }),
    );
  });

  it('un rechazo de negocio queda RECHAZADO_SIMULADO sin reintentar', async () => {
    const { procesar, proveedor } = armar(documento());
    proveedor.validar.mockResolvedValue({ aceptado: false, mensaje: 'Rechazo de prueba' });

    const resultado = await procesar();

    expect(resultado.estadoDian).toBe('RECHAZADO_SIMULADO');
    expect(resultado.mensajeDian).toBe('Rechazo de prueba');
  });

  it('si el proveedor está caído y quedan intentos, lanza para que BullMQ reintente', async () => {
    const { procesar, update, proveedor } = armar(documento());
    proveedor.validar.mockRejectedValue(new ProveedorDianNoDisponibleError());

    await expect(procesar(0, 3)).rejects.toBeInstanceOf(ProveedorDianNoDisponibleError);
    // Solo se guardó la URL del XML; el estado sigue PENDIENTE.
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0].data).toEqual({ urlXml: expect.any(String) });
  });

  it('en el último intento con el proveedor caído deja constancia del rechazo', async () => {
    const { procesar, proveedor } = armar(documento({ urlXml: 's3://ya-subido.xml' }));
    proveedor.validar.mockRejectedValue(new ProveedorDianNoDisponibleError());

    const resultado = await procesar(2, 3);

    expect(resultado.estadoDian).toBe('RECHAZADO_SIMULADO');
    expect(resultado.mensajeDian).toContain('tras 3 intentos');
  });

  it('no vuelve a subir el XML si un intento anterior ya lo guardó', async () => {
    const { procesar, almacen, proveedor } = armar(documento({ urlXml: 's3://ya-subido.xml' }));
    proveedor.validar.mockResolvedValue({ aceptado: true, mensaje: 'OK' });

    await procesar(1, 3);

    expect(almacen.subir).not.toHaveBeenCalled();
  });

  it('es idempotente: un documento ya resuelto no se valida de nuevo', async () => {
    const { procesar, proveedor } = armar(documento({ estadoDian: 'VALIDADO_SIMULADO', urlXml: 's3://x.xml' }));

    const resultado = await procesar();

    expect(proveedor.validar).not.toHaveBeenCalled();
    expect(resultado.estadoDian).toBe('VALIDADO_SIMULADO');
  });

  it('encola el comprobante por correo solo para domicilios validados', async () => {
    const domicilio = armar(documento({ pedido: { canal: 'DOMICILIO', total: '1', detalles: [] } }));
    domicilio.proveedor.validar.mockResolvedValue({ aceptado: true, mensaje: 'OK' });
    await domicilio.procesar();
    expect(domicilio.colaCorreo.encolarComprobante).toHaveBeenCalledWith('doc-1', CADENA);

    const salon = armar(documento());
    salon.proveedor.validar.mockResolvedValue({ aceptado: true, mensaje: 'OK' });
    await salon.procesar();
    expect(salon.colaCorreo.encolarComprobante).not.toHaveBeenCalled();
  });

  it('un documento inexistente o de otra cadena falla sin reintentos', async () => {
    await expect(armar(null).procesar()).rejects.toBeInstanceOf(UnrecoverableError);
    const ajeno = documento({ sede: { cadenaId: 'otra-cadena', nombre: 'X', rangoInicio: 1, rangoFin: 2 } });
    await expect(armar(ajeno).procesar()).rejects.toBeInstanceOf(UnrecoverableError);
  });
});
