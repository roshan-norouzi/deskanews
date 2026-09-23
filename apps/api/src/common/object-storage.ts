import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CreateBucketCommand, DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { promises as fs } from 'node:fs';
import path from 'node:path';

@Injectable()
export class ObjectStorage implements OnModuleInit {
  private readonly logger = new Logger(ObjectStorage.name);
  private client: S3Client | null = null;

  async onModuleInit() {
    if (!this.isRemote()) return;
    try {
      await this.s3().send(new CreateBucketCommand({ Bucket: this.bucket() }));
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      if (!['BucketAlreadyOwnedByYou', 'BucketAlreadyExists'].includes(name)) {
        this.logger.warn(`S3 bucket was not created: ${error instanceof Error ? error.message : 'unknown error'}`);
      }
    }
  }

  isRemote(): boolean {
    return (process.env.STORAGE_TYPE || 'local') === 's3';
  }

  async put(key: string, body: Buffer, contentType?: string): Promise<void> {
    if (!this.isRemote()) {
      const file = this.localPath(key);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, body);
      return;
    }
    await this.s3().send(new PutObjectCommand({
      Bucket: this.bucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    }));
  }

  async get(key: string): Promise<Buffer> {
    if (!this.isRemote()) return fs.readFile(this.localPath(key));
    const result = await this.s3().send(new GetObjectCommand({ Bucket: this.bucket(), Key: key }));
    const bytes = await result.Body?.transformToByteArray();
    if (!bytes) throw new Error('empty object');
    return Buffer.from(bytes);
  }

  async remove(key: string): Promise<void> {
    if (!this.isRemote()) {
      await fs.rm(this.localPath(key), { force: true });
      return;
    }
    await this.s3().send(new DeleteObjectCommand({ Bucket: this.bucket(), Key: key }));
  }

  private localPath(key: string) {
    const root = path.resolve(process.env.STORAGE_PATH || path.resolve(process.cwd(), 'uploads'));
    const file = path.resolve(root, key);
    if (!file.startsWith(root)) throw new Error('invalid storage key');
    return file;
  }

  private bucket() {
    const bucket = process.env.S3_BUCKET?.trim();
    if (!bucket) throw new Error('S3_BUCKET is required when STORAGE_TYPE=s3');
    return bucket;
  }

  private s3() {
    if (!this.client) {
      this.client = new S3Client({
        region: process.env.S3_REGION || 'us-east-1',
        endpoint: process.env.S3_ENDPOINT || undefined,
        forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
        credentials: {
          accessKeyId: process.env.S3_ACCESS_KEY || '',
          secretAccessKey: process.env.S3_SECRET_KEY || '',
        },
      });
      this.logger.log(`Object storage is S3 bucket ${this.bucket()}`);
    }
    return this.client;
  }
}
