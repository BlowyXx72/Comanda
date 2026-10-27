import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable, Logger } from '@nestjs/common';
import type { Readable } from 'node:stream';

const PREFIJO_URI = 's3://';

export interface OpcionesSubida {
  // Por defecto, el bucket de S3_BUCKET (documentos fiscales).
  bucket?: string;
  cacheControl?: string;
}

export interface ObjetoDescargado {
  cuerpo: Readable;
  tipo?: string;
  tamano?: number;
  etag?: string;
}

// Almacén de objetos de §5.1 ("XML fiscales e imágenes; almacenamiento
// barato, durable y separado de la base de datos").
// DECISIÓN DE PROTOTIPO: MinIO en docker compose, hablado con el cliente S3
// estándar; en AWS el mismo código apunta a Amazon S3 cambiando solo las
// variables S3_* (sin S3_ENDPOINT ni llaves: usa el rol de IAM de la EC2).
// Fase 16B: salió de fiscal/ a este módulo para que lo usen también las
// imágenes de producto sin acoplar los dos módulos.
// Consumido por: ProcesadorFiscalService y FiscalController (XML fiscal),
// ImagenesProductoService e ImagenesPublicasController (fotos del menú).
@Injectable()
export class AlmacenObjetosService {
  private readonly logger = new Logger(AlmacenObjetosService.name);
  readonly bucketDocumentos = process.env.S3_BUCKET ?? 'comanda-documentos';
  // Fase 16B: las fotos van en un bucket aparte porque son públicas (CDN),
  // y los XML fiscales no (y llevan retención de 5 años, §4.2).
  readonly bucketImagenes = process.env.S3_BUCKET_IMAGENES ?? 'comanda-imagenes';
  private readonly cliente = new S3Client({
    // Sin S3_ENDPOINT, el SDK usa Amazon S3 de la región.
    endpoint: process.env.S3_ENDPOINT || undefined,
    region: process.env.S3_REGION ?? 'us-east-1',
    // MinIO sirve los buckets como ruta (http://minio:9000/bucket/llave), no
    // como subdominio. Amazon S3 usa subdominio (S3_FORCE_PATH_STYLE=false).
    forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? 'true') === 'true',
    // Sin llaves en el entorno, el SDK toma las credenciales del rol de IAM
    // de la instancia (Fase 19B): nada de llaves de AWS en el .env.
    ...(process.env.S3_ACCESS_KEY
      ? {
          credentials: {
            accessKeyId: process.env.S3_ACCESS_KEY,
            secretAccessKey: process.env.S3_SECRET_KEY ?? '',
          },
        }
      : {}),
  });
  private readonly bucketsListos = new Set<string>();

  // Devuelve la URI (s3://bucket/llave) que se guarda en la base
  // (DocumentoFiscal.urlXml, Producto.imagenUrl).
  async subir(llave: string, contenido: string | Buffer, tipo: string, opciones: OpcionesSubida = {}): Promise<string> {
    const bucket = opciones.bucket ?? this.bucketDocumentos;
    await this.asegurarBucket(bucket);
    await this.cliente.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: llave,
        Body: contenido,
        ContentType: tipo,
        CacheControl: opciones.cacheControl,
      }),
    );
    return `${PREFIJO_URI}${bucket}/${llave}`;
  }

  async descargarTexto(uri: string): Promise<string> {
    const { bucket, llave } = this.separarUri(uri);
    const respuesta = await this.cliente.send(new GetObjectCommand({ Bucket: bucket, Key: llave }));
    return (await respuesta.Body?.transformToString('utf-8')) ?? '';
  }

  // Para servir un objeto por HTTP sin cargarlo entero en memoria. null si
  // la llave no existe.
  async descargar(bucket: string, llave: string): Promise<ObjetoDescargado | null> {
    try {
      const respuesta = await this.cliente.send(new GetObjectCommand({ Bucket: bucket, Key: llave }));
      return {
        cuerpo: respuesta.Body as Readable,
        tipo: respuesta.ContentType,
        tamano: respuesta.ContentLength,
        etag: respuesta.ETag,
      };
    } catch (err) {
      if (err instanceof NoSuchKey) return null;
      throw err;
    }
  }

  async borrar(bucket: string, llaves: string[]) {
    if (llaves.length === 0) return;
    await this.cliente.send(
      new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: llaves.map((Key) => ({ Key })) } }),
    );
  }

  separarUri(uri: string) {
    const sinPrefijo = uri.slice(PREFIJO_URI.length);
    const barra = sinPrefijo.indexOf('/');
    return { bucket: sinPrefijo.slice(0, barra), llave: sinPrefijo.slice(barra + 1) };
  }

  private async asegurarBucket(bucket: string) {
    if (this.bucketsListos.has(bucket)) return;
    try {
      await this.cliente.send(new HeadBucketCommand({ Bucket: bucket }));
    } catch {
      // TODO PRODUCCIÓN: en AWS los buckets los crea el despliegue (Fase
      // 19B, con su política y ciclo de vida); esto solo cubre MinIO local.
      await this.cliente.send(new CreateBucketCommand({ Bucket: bucket }));
      this.logger.log(`Bucket ${bucket} creado`);
    }
    this.bucketsListos.add(bucket);
  }
}
