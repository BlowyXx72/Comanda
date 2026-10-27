import { ValidationPipe } from '@nestjs/common';
import { ActualizarProductoDto } from './actualizar-producto.dto.js';
import { CrearProductoDto } from './crear-producto.dto.js';

// Fase 15: POST/PATCH /productos recortan los espacios del nombre y la
// categoría. Usa el mismo ValidationPipe global de main.ts.
const pipe = new ValidationPipe({ whitelist: true, transform: true });
const validar = <T>(metatype: new () => T, value: unknown) =>
  pipe.transform(value, { type: 'body', metatype }) as Promise<T>;

describe('DTO de productos', () => {
  it('recorta nombre y categoría al crear', async () => {
    const dto = await validar(CrearProductoDto, { nombre: '  Limonada ', precio: 4000, categoria: ' Bebidas  ' });
    expect(dto.nombre).toBe('Limonada');
    expect(dto.categoria).toBe('Bebidas');
  });

  it('rechaza un nombre que solo tiene espacios', async () => {
    await expect(validar(CrearProductoDto, { nombre: '   ', precio: 4000, categoria: 'Bebidas' })).rejects.toThrow();
  });

  it('recorta el nombre al editar y deja pasar los campos que no vienen', async () => {
    const dto = await validar(ActualizarProductoDto, { nombre: ' Limonada de coco ' });
    expect(dto.nombre).toBe('Limonada de coco');
    expect(dto.categoria).toBeUndefined();
  });

  it('sigue rechazando un nombre que no es texto', async () => {
    await expect(validar(ActualizarProductoDto, { nombre: 123 })).rejects.toThrow();
  });
});
