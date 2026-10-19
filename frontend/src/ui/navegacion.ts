import type { Rol } from '../auth/AuthContext';
import type { NombreIcono } from './Icono';

export interface Destino {
  ruta: string;
  titulo: string;
  descripcion: string;
  icono: NombreIcono;
  roles: Rol[];
}

// Pantallas del personal. Las usan la barra superior (BarraSuperior) y la
// página de inicio. Para agregar una pantalla nueva (p. ej. /inventario de la
// Fase 11) basta con agregar una entrada aquí: aparece en ambas.
export const DESTINOS: Destino[] = [
  {
    ruta: '/mesas',
    titulo: 'Mesas',
    descripcion: 'Toma pedidos y envía comandas a cocina.',
    icono: 'mesas',
    roles: ['MESERO', 'ADMIN'],
  },
  {
    ruta: '/cocina',
    titulo: 'Cocina',
    descripcion: 'Comandas en vivo de la sede.',
    icono: 'cocina',
    roles: ['MESERO', 'CAJERO', 'ADMIN'],
  },
  {
    ruta: '/caja',
    titulo: 'Caja',
    descripcion: 'Cobra pedidos listos y emite el documento.',
    icono: 'caja',
    roles: ['CAJERO', 'ADMIN'],
  },
  {
    ruta: '/panel',
    titulo: 'Panel',
    descripcion: 'Ventas consolidadas de todas las sedes.',
    icono: 'panel',
    roles: ['ADMIN'],
  },
  {
    ruta: '/catalogo',
    titulo: 'Catálogo',
    descripcion: 'Productos y precios de la cadena.',
    icono: 'catalogo',
    roles: ['ADMIN'],
  },
  {
    ruta: '/inventario',
    titulo: 'Inventario',
    descripcion: 'Existencias de insumos por sede.',
    icono: 'inventario',
    roles: ['ADMIN'],
  },
];

export const destinosDeRol = (rol: Rol | undefined) => DESTINOS.filter((d) => rol && d.roles.includes(rol));
