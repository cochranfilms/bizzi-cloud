"use client";

import { useEffect, useRef, useState } from "react";
import Uppy from "@uppy/core";
import Dashboard from "@uppy/react/dashboard";
import AwsS3 from "@uppy/aws-s3";
import { getFirebaseAuth } from "@/lib/firebase/client";

import "@uppy/core/css/style.min.css";
import "@uppy/dashboard/css/style.min.css";

interface UppyUploadModalProps {
  open: boolean;
  onClose: () => void;
  driveId: string;
  pathPrefix?: string;
  workspaceId?: string | null;
  onUploadComplete?: () => void;
}

export default function UppyUploadModal({
  open,
  onClose,
  driveId,
  pathPrefix = "",
  workspaceId = null,
  onUploadComplete,
}: UppyUploadModalProps) {
  const uppyRef = useRef<Uppy | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!open) {
      setReady(false);
      return;
    }

    const getIdToken = () =>
      getFirebaseAuth().currentUser?.getIdToken(true) ?? Promise.resolve(null);

    const uppy = new Uppy({
      id: "uppy-upload",
      autoProceed: false,
    });

    const awsS3Opts = {
      endpoint: typeof window !== "undefined" ? `${window.location.origin}/api/uppy` : "",
      async headers() {
        const token = await getIdToken();
        return token ? { Authorization: `Bearer ${token}` } : {};
      },
      shouldUseMultipart: (file: { size?: number }) => (file.size ?? 0) > 5 * 1024 * 1024,
    };
    // @ts-expect-error Uppy types don't support async headers but runtime does
    uppy.use(AwsS3, awsS3Opts);

    uppy.on("file-added", (file) => {
      const relPath = pathPrefix ? `${pathPrefix}/${file.name}` : file.name;
      uppy.setFileState(file.id, {
        meta: {
          ...file.meta,
          driveId,
          relativePath: relPath,
          sizeBytes: file.size ?? 0,
          workspaceId: workspaceId ?? undefined,
        },
      });
    });

    uppy.on("upload-success", () => {
      onUploadComplete?.();
    });

    uppy.on("complete", () => {
      onClose();
      setTimeout(() => {
        uppy.cancelAll();
        onUploadComplete?.();
      }, 500);
    });

    uppyRef.current = uppy;
    setReady(true);

    return () => {
      uppy.cancelAll();
      uppy.destroy();
      uppyRef.current = null;
      setReady(false);
    };
  }, [open, driveId, pathPrefix, workspaceId, onClose, onUploadComplete]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-2xl rounded-xl bg-white p-4 shadow-xl dark:bg-neutral-900">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-2 top-2 rounded p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-700 dark:hover:text-neutral-200"
          aria-label="Close"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
        {ready && uppyRef.current && (
          <Dashboard
            uppy={uppyRef.current}
            proudlyDisplayPoweredByUppy={false}
            height={400}
          />
        )}
      </div>
    </div>
  );
}
