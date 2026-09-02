/**
 * StorageAdapter — object storage, used in V1 only where genuinely needed.
 *
 * Backed by Supabase Storage. Objects are user-scoped and private; access is granted
 * through short-lived signed URLs, never public buckets. Photo memory and travel gallery
 * are future scope and must not be built against this interface.
 *
 * Type-only stub.
 */

export interface StoredObjectRef {
  bucket: string;
  /** Object key, always prefixed by the owning user's id. */
  key: string;
}

export interface PutObjectRequest extends StoredObjectRef {
  body: ArrayBuffer;
  contentType: string;
  /** Overwrite an existing object at the same key. Defaults to false. */
  upsert?: boolean;
}

export interface StoredObjectMetadata extends StoredObjectRef {
  contentType: string;
  sizeBytes: number;
  createdAt: Date;
}

export interface SignedUrl {
  url: string;
  expiresAt: Date;
}

export interface StorageAdapter {
  readonly name: string;
  put(request: PutObjectRequest): Promise<StoredObjectMetadata>;
  getSignedUrl(ref: StoredObjectRef, expiresInSeconds: number): Promise<SignedUrl>;
  delete(ref: StoredObjectRef): Promise<void>;
}
