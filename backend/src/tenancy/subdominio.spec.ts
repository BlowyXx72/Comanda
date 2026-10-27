import { subdominioDeHost, subdominiosHabilitados, urlPublicaCadena } from './subdominio.js';

// Fase 20B: reconocer el subdominio de la cadena en el Host de la petición.
describe('subdominio por cadena', () => {
  const original = process.env.URL_PUBLICA_CADENA;
  afterEach(() => {
    process.env.URL_PUBLICA_CADENA = original;
  });

  it('sin URL_PUBLICA_CADENA no hay subdominios (todo por el dominio principal)', () => {
    process.env.URL_PUBLICA_CADENA = '';
    expect(subdominiosHabilitados()).toBe(false);
    expect(subdominioDeHost('demo.comanda.ejemplo.co')).toBeNull();
    expect(urlPublicaCadena('demo')).toBeNull();
  });

  describe('en la beta', () => {
    beforeEach(() => {
      process.env.URL_PUBLICA_CADENA = 'https://{subdominio}.comanda.ejemplo.co';
    });

    it.each([
      ['demo.comanda.ejemplo.co', 'demo'],
      ['La-Cadena.Comanda.Ejemplo.co', 'la-cadena'],
      ['demo.comanda.ejemplo.co:443', 'demo'],
    ])('%s -> %s', (host, esperado) => {
      expect(subdominioDeHost(host)).toBe(esperado);
    });

    it.each(['comanda.ejemplo.co', 'otro.dominio.co', 'a.b.comanda.ejemplo.co', '-mal.comanda.ejemplo.co', undefined])(
      'no reconoce %s',
      (host) => {
        expect(subdominioDeHost(host)).toBeNull();
      },
    );

    it('arma la URL pública de una cadena', () => {
      expect(urlPublicaCadena('demo')).toBe('https://demo.comanda.ejemplo.co');
      expect(urlPublicaCadena(null)).toBeNull();
    });
  });

  it('en local, con *.localhost y puerto', () => {
    process.env.URL_PUBLICA_CADENA = 'https://{subdominio}.localhost:8443/';
    expect(subdominioDeHost('demo.localhost:8443')).toBe('demo');
    expect(subdominioDeHost('demo.localhost:5173')).toBe('demo');
    expect(subdominioDeHost('localhost:8443')).toBeNull();
    expect(urlPublicaCadena('demo')).toBe('https://demo.localhost:8443');
  });
});
