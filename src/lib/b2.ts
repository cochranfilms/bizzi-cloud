import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
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
