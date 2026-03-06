import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
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
  });
  return getSignedUrl(client, command, { expiresIn });
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
  expiresIn = 3600
): Promise<string> {
  const client = getB2Client();
  const command = new GetObjectCommand({
    Bucket: B2_BUCKET_NAME,
    Key: objectKey,
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
    contentRange: response.ContentRange ?? undefined,
  };
}

/** Stream full object from B2 (for Local Store full downloads). */
export async function getObject(
  objectKey: string
): Promise<{ body: NodeJS.ReadableStream; contentLength: number }> {
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
  };
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
