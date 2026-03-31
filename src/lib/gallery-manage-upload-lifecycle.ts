/**
 * Events for optimistic manage-grid rows during gallery uploads (Uppy-driven).
 * Only emitted when uploading with a galleryId (manage surface).
 */

export type GalleryManageUploadLifecycleEvent =
  | { type: "file_added"; clientId: string; name: string; size: number }
  | { type: "upload_progress"; clientId: string; bytesUploaded: number; bytesTotal: number }
  | /** Bytes reached storage; awaiting server link to gallery_assets */ {
      type: "upload_processing";
      clientId: string;
    }
  | { type: "upload_error"; clientId: string; message: string };
