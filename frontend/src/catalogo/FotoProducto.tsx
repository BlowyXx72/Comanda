import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { quitarImagenProducto, subirImagenProducto, type Producto } from '../api/comanda';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Icono } from '../ui/Icono';

// Mismas reglas que el backend (procesar-imagen.ts): se revisan aquí también
// para avisar al instante, sin gastar la subida de un archivo que no sirve.
const TIPOS_ACEPTADOS = ['image/jpeg', 'image/png', 'image/webp'];
const TAMANO_MAXIMO_BYTES = 2 * 1024 * 1024;

interface FotoProductoProps {
  producto: Producto;
  // Se llama cuando la foto cambió, para recargar la lista.
  alCambiar: () => void;
}

// Fase 16B (CU-03): foto de un producto en /catalogo (solo ADMIN). Componente
// aparte para que Catalogo.tsx (Parte 1) solo gane una columna. El backend la
// recorta a 4:3 y la pasa a WebP; /mesas y el menú QR la reciben en vivo por
// `catalogo:actualizado`.
export function FotoProducto({ producto, alCambiar }: FotoProductoProps) {
  const { token } = useAuth();
  const entrada = useRef<HTMLInputElement>(null);
  // Vista previa local mientras sube. Se guarda junto con la URL que tenía el
  // producto al elegir el archivo: cuando la lista recarga con la foto nueva,
  // esa URL cambia y la vista previa deja de mostrarse sola.
  const [vistaPrevia, setVistaPrevia] = useState<{ url: string; sobre: string | null } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!vistaPrevia) return;
    return () => URL.revokeObjectURL(vistaPrevia.url);
  }, [vistaPrevia]);

  const elegir = async (e: ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo || !token) return;
    if (!TIPOS_ACEPTADOS.includes(archivo.type)) {
      setError('Usa una foto JPEG, PNG o WebP');
      return;
    }
    if (archivo.size > TAMANO_MAXIMO_BYTES) {
      setError('La foto pesa más de 2 MB');
      return;
    }
    setError(null);
    setVistaPrevia({ url: URL.createObjectURL(archivo), sobre: producto.imagenMiniaturaUrl });
    setOcupado(true);
    try {
      await subirImagenProducto(producto.id, archivo, token);
      alCambiar();
    } catch (err) {
      setVistaPrevia(null);
      setError(err instanceof ApiError ? err.message : 'No se pudo subir la foto');
    } finally {
      setOcupado(false);
    }
  };

  const quitar = async () => {
    if (!token) return;
    setError(null);
    setOcupado(true);
    try {
      await quitarImagenProducto(producto.id, token);
      alCambiar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo quitar la foto');
    } finally {
      setOcupado(false);
    }
  };

  const previaVigente = vistaPrevia && vistaPrevia.sobre === producto.imagenMiniaturaUrl ? vistaPrevia.url : null;
  const src = previaVigente ?? producto.imagenMiniaturaUrl;

  return (
    <div className="foto-producto">
      <button
        type="button"
        className="foto-producto-marco"
        onClick={() => entrada.current?.click()}
        disabled={ocupado}
        aria-label={`${src ? 'Cambiar' : 'Subir'} la foto de ${producto.nombre}`}
        title={src ? 'Cambiar foto' : 'Subir foto'}
      >
        {src ? (
          <img src={src} alt="" width={96} height={72} decoding="async" />
        ) : (
          <span className="foto-producto-vacia">
            <Icono nombre="foto" tamano={20} />
            Foto
          </span>
        )}
        {ocupado && <span className="foto-producto-estado">{previaVigente ? 'Subiendo…' : 'Guardando…'}</span>}
      </button>
      {producto.imagenUrl && !ocupado && (
        <button type="button" className="foto-producto-quitar" onClick={quitar}>
          Quitar
        </button>
      )}
      <input
        ref={entrada}
        type="file"
        accept={TIPOS_ACEPTADOS.join(',')}
        onChange={elegir}
        hidden
        tabIndex={-1}
      />
      {error && (
        <p className="foto-producto-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
