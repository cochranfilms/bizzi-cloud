import {
  abortMultipartUpload,
  completeMultipartUpload,
  createMultipartUpload,
  uploadMultipartPartServerSide,
  computeAdaptivePartPlan,
  MULTIPART_PART_SIZE,
  putObject,
} from "@/lib/b2";

export interface StreamToB2Result {
  parts: { partNumber: number; etag: string }[];
  used_multipart: boolean;
}

/**
 * Stream a Web `ReadableStream` of bytes into B2 (multipart when non-empty).
 */
export async function streamWebBodyToB2Multipart(params: {
  objectKey: string;
  contentType: string;
  contentLength: number | null;
  body: ReadableStream<Uint8Array> | null;
}): Promise<StreamToB2Result> {
  const { objectKey, contentType, contentLength, body } = params;
  if (!body) throw new Error("No response body");

  const reader = body.getReader();
  const first = await reader.read();
  if (first.done && (!first.value || first.value.byteLength === 0)) {
    await putObject(objectKey, Buffer.alloc(0), contentType || "application/octet-stream");
    return { parts: [], used_multipart: false };
  }

  let buf = first.value
    ? Buffer.from(first.value.buffer, first.value.byteOffset, first.value.byteLength)
    : Buffer.alloc(0);

  const partSize =
    contentLength != null && Number.isFinite(contentLength) && contentLength > 0
      ? computeAdaptivePartPlan(contentLength).partSize
      : MULTIPART_PART_SIZE;

  const { uploadId } = await createMultipartUpload(
    objectKey,
    contentType || "application/octet-stream"
  );
  const parts: { partNumber: number; etag: string }[] = [];
  let partNumber = 1;

  try {
    for (;;) {
      while (buf.length >= partSize) {
        const chunk = buf.subarray(0, partSize);
        buf = buf.subarray(partSize);
        const { etag } = await uploadMultipartPartServerSide(objectKey, uploadId, partNumber, chunk);
        parts.push({ partNumber: partNumber++, etag });
      }

      const next = await reader.read();
      if (next.done) {
        if (buf.length > 0) {
          const { etag } = await uploadMultipartPartServerSide(objectKey, uploadId, partNumber, buf);
          parts.push({ partNumber: partNumber++, etag });
        }
        break;
      }
      if (next.value && next.value.byteLength) {
        buf = Buffer.concat([
          buf,
          Buffer.from(next.value.buffer, next.value.byteOffset, next.value.byteLength),
        ]);
      }
    }

    await completeMultipartUpload(
      objectKey,
      uploadId,
      parts.map((p) => ({ partNumber: p.partNumber, etag: p.etag }))
    );
    return { parts, used_multipart: true };
  } catch (err) {
    await abortMultipartUpload(objectKey, uploadId).catch(() => {});
    throw err;
  }
}
