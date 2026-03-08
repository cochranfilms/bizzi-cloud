import { createHash } from "crypto";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  type CompletedPart,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const B2_ACCESS_KEY_ID = process.env.B2_ACCESS_KEY_ID;
const B2_SECRET_ACCESS_KEY = process.env.B2_SECRET_ACCESS_KEY;
const B2_BUCKET_NAME = process.env.B2_BUCKET_NAME;
const B2_ENDPOINT = process.env.B2_ENDPOINT;
const B2_REGION = process.env.B2_REGION ?? "us-west-004";

export const isB2Configured = () =>
  !!B2_ACCESS_KEY_ID && !!B2_SECRET_ACCESS_KEY && !!B2_BUCKET_NAME && !!B2_ENDPOINT;

function getB2Client(): S3Client {
  if (!isB2Configured()) {
    throw new Error("Backblaze B2 is not configured");
  }
  return new S3Client({
    endpoint: B2_ENDPOINT,
    region: B2_REGION,
    credentials: {
      accessKeyId: B2_ACCESS_KEY_ID!,
      secretAccessKey: B2_SECRET_ACCESS_KEY!,
    },
    forcePathStyle: true,
  });
}

/** B2 minimum part size 5MB, max 5GB. Max 10,000 parts. */
const B2_PART_MIN = 5 * 1024 * 1024;
const B2_PART_MAX = 5 * 1024 * 1024 * 1024;
const B2_MAX_PARTS = 10000;

/** Presigned URL expiry for multipart upload parts (7 days). S3/B2 support up to 7 days. */
export const MULTIPART_PRESIGN_EXPIRY = 7 * 24 * 60 * 60;

/** B2 minimum part size is 5MB. Use 8MB for balance of throughput and memory. */
export const MULTIPART_PART_SIZE = 8 * 1024 * 1024;

/** Use multipart for files larger than this (must be > 5MB for B2). */
export const MULTIPART_THRESHOLD = 5 * 1024 * 1024;

export interface AdaptivePartPlan {
  partSize: number;
  totalParts: number;
  recommendedConcurrency: number;
}

/**
 * Adaptive part sizing per Backblaze recommendations.
 * < 250MB: 8MB; 250MB–5GB: 32MB; 5–50GB: 64MB; 50–200GB: 128MB; > 200GB: 256MB.
 * Keeps total parts under 10,000. Optimized for 8K/BRAW and very large files.
 */
export function computeAdaptivePartPlan(fileSizeBytes: number): AdaptivePartPlan {
  let partSize: number;
  let concurrency: number;
  if (fileSizeBytes < 250 * 1024 * 1024) {
    partSize = 8 * 1024 * 1024;
    concurrency = 6;
  } else if (fileSizeBytes < 5 * 1024 * 1024 * 1024) {
    partSize = 32 * 1024 * 1024;
    concurrency = 8;
  } else if (fileSizeBytes < 50 * 1024 * 1024 * 1024) {
    partSize = 64 * 1024 * 1024;
    concurrency = 10;
  } else if (fileSizeBytes < 200 * 1024 * 1024 * 1024) {
    partSize = 128 * 1024 * 1024;
    concurrency = 10;
  } else {
    partSize = 256 * 1024 * 1024;
    concurrency = 10;
  }
  let totalParts = Math.ceil(fileSizeBytes / partSize);
  if (totalParts > B2_MAX_PARTS) {
    partSize = Math.ceil(fileSizeBytes / B2_MAX_PARTS);
    partSize = Math.max(B2_PART_MIN, Math.min(partSize, B2_PART_MAX));
    totalParts = Math.ceil(fileSizeBytes / partSize);
  }
  return { partSize, totalParts, recommendedConcurrency: concurrency };
}

/** Batch create presigned URLs for multiple parts (reduces API round-trips). */
export async function createPresignedPartUrlsBatch(
  objectKey: string,
  uploadId: string,
  partNumbers: number[],
  expiresIn = MULTIPART_PRESIGN_EXPIRY
): Promise<{ partNumber: number; uploadUrl: string }[]> {
  const client = getB2Client();
  const results = await Promise.all(
    partNumbers.map(async (partNumber) => {
      const command = new UploadPartCommand({
        Bucket: B2_BUCKET_NAME,
        Key: objectKey,
        UploadId: uploadId,
        PartNumber: partNumber,
      });
      const url = await getSignedUrl(client, command, { expiresIn });
      return { partNumber, uploadUrl: url };
    })
  );
  return results;
}

/**
 * SSE-B2: Backblaze B2 server-side encryption with Backblaze-managed keys (AES-256).
 * All objects stored with encryption at rest. Client must send x-amz-server-side-encryption: AES256 when using presigned PUT.
 */
const SSE_B2_HEADER = { ServerSideEncryption: "AES256" as const };

export async function createPresignedUploadUrl(
  objectKey: string,
  contentType: string,
  expiresIn = 3600
): Promise<string> {
  const client = getB2Client();
  const command = new PutObjectCommand({
    Bucket: B2_BUCKET_NAME,
    Key: objectKey,
    ContentType: contentType,
    ...SSE_B2_HEADER,
  });
  return getSignedUrl(client, command, { expiresIn });
}

/** Initiate multipart upload for large files. Returns uploadId for subsequent part uploads. SSE-B2 enabled by default. */
export async function createMultipartUpload(
  objectKey: string,
  contentType: string
): Promise<{ uploadId: string }> {
  const client = getB2Client();
  const response = await client.send(
    new CreateMultipartUploadCommand({
      Bucket: B2_BUCKET_NAME,
      Key: objectKey,
      ContentType: contentType,
      ...SSE_B2_HEADER,
    })
  );
  const uploadId = response.UploadId;
  if (!uploadId) throw new Error("CreateMultipartUpload did not return uploadId");
  return { uploadId };
}

/** Create presigned URL for a single part of a multipart upload. */
export async function createPresignedPartUrl(
  objectKey: string,
  uploadId: string,
  partNumber: number,
  expiresIn = 3600
): Promise<string> {
  const client = getB2Client();
  const command = new UploadPartCommand({
    Bucket: B2_BUCKET_NAME,
    Key: objectKey,
    UploadId: uploadId,
    PartNumber: partNumber,
  });
  return getSignedUrl(client, command, { expiresIn });
}

/** Abort multipart upload and remove any uploaded parts from B2. */
export async function abortMultipartUpload(
  objectKey: string,
  uploadId: string
): Promise<void> {
  const client = getB2Client();
  await client.send(
    new AbortMultipartUploadCommand({
      Bucket: B2_BUCKET_NAME,
      Key: objectKey,
      UploadId: uploadId,
    })
  );
}

/** Complete multipart upload with part ETags. */
export async function completeMultipartUpload(
  objectKey: string,
  uploadId: string,
  parts: { partNumber: number; etag: string }[]
): Promise<void> {
  const client = getB2Client();
  const completedParts: CompletedPart[] = parts
    .sort((a, b) => a.partNumber - b.partNumber)
    .map((p) => ({ ETag: p.etag, PartNumber: p.partNumber }));
  await client.send(
    new CompleteMultipartUploadCommand({
      Bucket: B2_BUCKET_NAME,
      Key: objectKey,
      UploadId: uploadId,
      MultipartUpload: { Parts: completedParts },
    })
  );
}

/** Check if an object exists in B2 (used for content-hash deduplication). */
export async function objectExists(objectKey: string): Promise<boolean> {
  const client = getB2Client();
  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: B2_BUCKET_NAME,
        Key: objectKey,
      })
    );
    return true;
  } catch (err: unknown) {
    const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (e?.name === "NotFound" || e?.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw err;
  }
}

export async function createPresignedDownloadUrl(
  objectKey: string,
  expiresIn = 3600,
  /** When provided, adds ResponseContentDisposition to force download instead of inline display */
  downloadFilename?: string
): Promise<string> {
  const client = getB2Client();
  const command = new GetObjectCommand({
    Bucket: B2_BUCKET_NAME,
    Key: objectKey,
    ...(downloadFilename && {
      ResponseContentDisposition: `attachment; filename="${downloadFilename.replace(/"/g, '\\"')}"`,
    }),
  });
  return getSignedUrl(client, command, { expiresIn });
}

export interface ByteRange {
  start: number;
  end: number;
}

/** Stream a byte range from B2. Used for mounted drive streaming and Local Store downloads. */
export async function getObjectRange(
  objectKey: string,
  range: ByteRange
): Promise<{
  body: NodeJS.ReadableStream;
  contentLength: number;
  contentType?: string;
  contentRange?: string;
}> {
  const client = getB2Client();
  const rangeHeader = `bytes=${range.start}-${range.end}`;
  const response = await client.send(
    new GetObjectCommand({
      Bucket: B2_BUCKET_NAME,
      Key: objectKey,
      Range: rangeHeader,
    })
  );
  const body = response.Body;
  if (!body) {
    throw new Error("Empty response body from B2");
  }
  const contentLength = range.end - range.start + 1;
  return {
    body: body as NodeJS.ReadableStream,
    contentLength,
    contentType: response.ContentType ?? undefined,
    contentRange: response.ContentRange ?? undefined,
  };
}

/** Stream full object from B2 (for Local Store full downloads). */
export async function getObject(
  objectKey: string
): Promise<{
  body: NodeJS.ReadableStream;
  contentLength: number;
  contentType?: string;
}> {
  const client = getB2Client();
  const response = await client.send(
    new GetObjectCommand({
      Bucket: B2_BUCKET_NAME,
      Key: objectKey,
    })
  );
  const body = response.Body;
  if (!body) {
    throw new Error("Empty response body from B2");
  }
  const contentLength = response.ContentLength ?? 0;
  return {
    body: body as NodeJS.ReadableStream,
    contentLength,
    contentType: response.ContentType ?? undefined,
  };
}

/** Upload a buffer to B2 (e.g. cached video thumbnails). SSE-B2 enabled. */
export async function putObject(
  objectKey: string,
  body: Buffer | Uint8Array,
  contentType: string
): Promise<void> {
  const client = getB2Client();
  await client.send(
    new PutObjectCommand({
      Bucket: B2_BUCKET_NAME,
      Key: objectKey,
      Body: body,
      ContentType: contentType,
      ...SSE_B2_HEADER,
    })
  );
}

/** Deterministic cache key for video thumbnails. Same objectKey = same cache key. */
export function getVideoThumbnailCacheKey(objectKey: string): string {
  const hash = createHash("sha256").update(objectKey).digest("hex").slice(0, 32);
  return `thumbnails/${hash}.jpg`;
}

/** Deterministic key for proxy video. Same objectKey = same proxy key. */
export function getProxyObjectKey(objectKey: string): string {
  const hash = createHash("sha256").update(objectKey).digest("hex").slice(0, 32);
  return `proxies/${hash}.mp4`;
}

/** Read object into a buffer, with optional max bytes limit (for thumbnail generation). */
export async function getObjectBuffer(
  objectKey: string,
  maxBytes = 50 * 1024 * 1024
): Promise<Buffer> {
  const { body, contentLength } = await getObject(objectKey);
  if (contentLength > maxBytes) {
    throw new Error(`Object too large for processing (${contentLength} > ${maxBytes})`);
  }
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
    if (chunks.reduce((sum, c) => sum + c.length, 0) > maxBytes) {
      throw new Error(`Object too large for processing`);
    }
  }
  return Buffer.concat(chunks);
}
