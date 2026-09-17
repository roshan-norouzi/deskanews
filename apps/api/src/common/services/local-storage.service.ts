import { Injectable } from '@nestjs/common';
import { constants, promises as fs } from 'node:fs';
import * as path from 'node:path';

export type StorageKind = 'fonts' | 'cover-images' | 'social-publishing';

@Injectable()
export class LocalStorageService {
  root(): string {
    return path.resolve(process.env.STORAGE_PATH || path.resolve(process.cwd(), 'uploads'));
  }

  directory(kind: StorageKind, tenantId?: string): string {
    if (tenantId) {
      if (!/^[a-zA-Z0-9_-]{10,64}$/u.test(tenantId)) throw new Error('invalid tenant id');
      return path.join(this.root(), kind, tenantId);
    }
    if (kind === 'social-publishing') return path.join(this.root(), kind);
    return path.join(this.root(), kind);
  }

  async write(relativeDirectory: string, filename: string, buffer: Buffer, mode = 0o644): Promise<string> {
    await fs.mkdir(relativeDirectory, { recursive: true });
    const target = path.join(relativeDirectory, filename);
    await fs.writeFile(target, buffer, { mode });
    return target;
  }

  async read(relativeDirectory: string, filename: string): Promise<Buffer> {
    return fs.readFile(path.join(relativeDirectory, path.basename(filename)));
  }

  async remove(relativeDirectory: string, filename: string): Promise<void> {
    await fs.unlink(path.join(relativeDirectory, path.basename(filename)));
  }

  async ensureWritable(): Promise<void> {
    if ((process.env.STORAGE_TYPE || 'local') !== 'local') return;
    const storagePath = this.root();
    await fs.mkdir(storagePath, { recursive: true });
    await fs.access(storagePath, constants.R_OK | constants.W_OK);
  }
}
