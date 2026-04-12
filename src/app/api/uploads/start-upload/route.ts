import { handleStartUpload } from "@/lib/uploads/start-upload-session";

export async function POST(request: Request) {
  return handleStartUpload(request);
}
