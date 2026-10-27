import { Transform } from 'class-transformer';

// Fase 15: quita los espacios al inicio y al final de un texto antes de
// validarlo, para que "  Café " no quede guardado así y "   " no pase el
// @MinLength(1). Un valor que no es texto se deja igual para que @IsString
// lo rechace.
export const Recortar = () =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));
