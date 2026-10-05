import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable, Logger } from '@nestjs/common';

const PREFIJO_URI = 's3://';

// Almacén de objetos de §5.1 ("XML fiscales e imágenes; almacenamiento
// barato, durable y separado de la base de datos").
// DECISIÓN DE PROTOTIPO: MinIO en docker compose, hablado con el cliente S3
// estándar; en producción el mismo código apuntaría a un servicio S3
// compatible cambiando solo las variables S3_*.
// Consumido por: ProcesadorFiscalService (sube el XML) y FiscalController
// (lo descarga para el navegador).
@Injectable()
export class AlmacenObjetosService {
  private readonly logger = new Logger(AlmacenObjetosService.name);
  private readonly bucket = process.env.S3_BUCKET ?? 'comanda-documentos';
  private readonly cliente = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? 'us-east-1',
    // MinIO sirve los buckets como ruta (http://minio:9000/bucket/llave), no
    // como subdominio.
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY ?? '',
      secretAccessKey: process.env.S3_SECRET_KEY ?? '',
    },
  });
  private bucketListo = false;

  // Devuelve la URI (s3://bucket/llave) que se guarda en DocumentoFiscal.urlXml.
  async subir(llave: string, contenido: string, tipo: string): Promise<string> {
    await this.asegurarBucket();
    await this.cliente.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: llave, Body: contenido, ContentType: tipo }),
    );
    return `${PREFIJO_URI}${this.bucket}/${llave}`;
  }

  async descargarTexto(uri: string): Promise<string> {
    const { bucket, llave } = this.separarUri(uri);
    const respuesta = await this.cliente.send(new GetObjectCommand({ Bucket: bucket, Key: llave }));
    return (await respuesta.Body?.transformToString('utf-8')) ?? '';
  }

  private separarUri(uri: string) {
    const sinPrefijo = uri.slice(PREFIJO_URI.length);
    const barra = sinPrefijo.indexOf('/');
    return { bucket: sinPrefijo.slice(0, barra), llave: sinPrefijo.slice(barra + 1) };
  }

  private async asegurarBucket() {
    if (this.bucketListo) return;
    try {
      await this.cliente.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await this.cliente.send(new CreateBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Bucket ${this.bucket} creado`);
    }
    this.bucketListo = true;
  }
}
