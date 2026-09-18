import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { constants, promises as fs } from 'node:fs';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import type { StorageKind } from './object-storage.types';
import { storageObjectKey, tenantStoragePrefix } from './object-storage.types';

async function streamToBuffer(body: Readable | NodeJS.ReadableStream | Blob | undefined): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);
  if (body instanceof Readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of body) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return Buffer.concat(chunks);
  }
  if (typeof (body as Blob).arrayBuffer === 'function') {
    return Buffer.from(await (body as Blob).arrayBuffer());
  }
  return Buffer.alloc(0);
}

@Injectable()
export class ObjectStorageService {
  private readonly logger = new Logger(ObjectStorageService.name);
  private readonly mode: 'local' | 's3';
  private readonly localRoot: string;
  private readonly s3?: S3Client;
  private readonly bucket?: string;

  constructor(private readonly config: ConfigService) {
    this.mode = this.config.get<string>('STORAGE_TYPE', 'local').trim().toLowerCase() === 's3' ? 's3' : 'local';
    this.localRoot = path.resolve(this.config.get<string>('STORAGE_PATH') || path.resolve(process.cwd(), 'uploads'));
    if (this.mode === 's3') {
      const endpoint = this.config.get<string>('S3_ENDPOINT')?.trim();
      const region = this.config.get<string>('S3_REGION', 'us-east-1').trim();
      const accessKeyId = this.config.get<string>('S3_ACCESS_KEY')?.trim();
      const secretAccessKey = this.config.get<string>('S3_SECRET_KEY')?.trim();
      this.bucket = this.config.get<string>('S3_BUCKET')?.trim();
      if (!endpoint || !this.bucket || !accessKeyId || !secretAccessKey) {
        throw new Error('S3 storage requires S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, and S3_SECRET_KEY');
      }
      this.s3 = new S3Client({
        region,
        endpoint,
        forcePathStyle: this.config.get<string>('S3_FORCE_PATH_STYLE', 'true') !== 'false',
        credentials: { accessKeyId, secretAccessKey },
      });
    }
  }

  backend(): 'local' | 's3' {
    return this.mode;
  }

  key(kind: StorageKind, filename: string, tenantId?: string): string {
    return storageObjectKey(kind, filename, tenantId);
  }

  localDirectory(kind: StorageKind, tenantId?: string): string {
    if (tenantId) {
      if (!/^[a-zA-Z0-9_-]{10,64}$/u.test(tenantId)) throw new Error('invalid tenant id');
      return path.join(this.localRoot, kind, tenantId);
    }
    return path.join(this.localRoot, kind);
  }

  async put(key: string, buffer: Buffer, options?: { contentType?: string; mode?: number }): Promise<void> {
    if (this.mode === 's3') {
      await this.s3!.send(new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: options?.contentType,
      }));
      return;
    }
    const target = path.join(this.localRoot, ...key.split('/'));
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, buffer, { mode: options?.mode ?? 0o644 });
  }

  async get(key: string): Promise<Buffer> {
    if (this.mode === 's3') {
      const response = await this.s3!.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      return streamToBuffer(response.Body as Readable);
    }
    return fs.readFile(path.join(this.localRoot, ...key.split('/')));
  }

  async delete(key: string): Promise<void> {
    if (this.mode === 's3') {
      await this.s3!.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
      return;
    }
    try {
      await fs.unlink(path.join(this.localRoot, ...key.split('/')));
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      if (code !== 'ENOENT') throw error;
    }
  }

  async deleteTenantObjects(tenantId: string): Promise<void> {
    for (const prefix of tenantStoragePrefix(tenantId)) {
      await this.deletePrefix(prefix);
    }
  }

  async deletePrefix(prefix: string): Promise<void> {
    if (this.mode === 's3') {
      let continuationToken: string | undefined;
      do {
        const listed = await this.s3!.send(new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }));
        const keys = (listed.Contents ?? []).map((item) => item.Key).filter(Boolean) as string[];
        if (keys.length) {
          await this.s3!.send(new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: { Objects: keys.map((Key) => ({ Key })) },
          }));
        }
        continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
      } while (continuationToken);
      return;
    }

    const target = path.join(this.localRoot, ...prefix.replace(/\/$/u, '').split('/'));
    await fs.rm(target, { recursive: true, force: true });
  }

  async ensureReady(): Promise<void> {
    if (this.mode === 's3') {
      await this.s3!.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return;
    }
    await fs.mkdir(this.localRoot, { recursive: true });
    await fs.access(this.localRoot, constants.R_OK | constants.W_OK);
  }
}
