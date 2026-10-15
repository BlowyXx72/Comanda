import { createHash } from 'node:crypto';

// La API key de una plataforma se guarda solo como hash. SHA-256 (y no
// bcrypt, como las contraseñas) porque la llave es aleatoria y larga: no hay
// diccionario que probar, y el hash determinista permite buscarla por índice
// en vez de comparar contra todas las integraciones.
// Consumido por: ApiKeyPlataformaGuard y prisma/seed.ts.
export const hashApiKey = (apiKey: string) => createHash('sha256').update(apiKey, 'utf8').digest('hex');
