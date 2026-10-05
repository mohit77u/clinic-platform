import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

export abstract class FileStorage {
  /** Stores bytes under a relative key and returns the public URL. */
  abstract put(key: string, data: Buffer): Promise<string>;
}

/** Dev/VPS storage on local disk, served by the API under /uploads. Swap for S3/R2 later. */
@Injectable()
export class LocalFileStorage extends FileStorage {
  readonly root: string;
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    super();
    this.root = resolve(config.getOrThrow<string>('UPLOAD_DIR'));
    this.baseUrl = config.getOrThrow<string>('PUBLIC_BASE_URL');
  }

  async put(key: string, data: Buffer): Promise<string> {
    const target = join(this.root, key);
    if (!target.startsWith(this.root)) throw new Error('Invalid storage key');
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, data);
    return `${this.baseUrl}/uploads/${key}`;
  }
}
