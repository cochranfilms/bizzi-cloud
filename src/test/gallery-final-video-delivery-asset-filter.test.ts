import { describe, it, expect } from "vitest";
import { shouldOmitAssetFromFinalVideoDeliveryListing } from "@/lib/gallery-final-video-delivery-asset-filter";

const finalVideoGallery = {
  id: "g1",
  gallery_type: "video",
  media_mode: "final",
  source_format: "jpg",
  media_folder_segment: "my-event",
};

describe("shouldOmitAssetFromFinalVideoDeliveryListing", () => {
  it("omits paths under gallery RAW archive for Final video", () => {
    expect(
      shouldOmitAssetFromFinalVideoDeliveryListing(finalVideoGallery, "my-event/RAW/source.mov")
    ).toBe(true);
    expect(
      shouldOmitAssetFromFinalVideoDeliveryListing(finalVideoGallery, "my-event/delivery.mov")
    ).toBe(false);
  });

  it("does not omit for RAW video mode", () => {
    expect(
      shouldOmitAssetFromFinalVideoDeliveryListing(
        { ...finalVideoGallery, media_mode: "raw", source_format: "raw" },
        "my-event/RAW/source.mov"
      )
    ).toBe(false);
  });

  it("does not omit for photo gallery", () => {
    expect(
      shouldOmitAssetFromFinalVideoDeliveryListing(
        { ...finalVideoGallery, gallery_type: "photo" },
        "my-event/RAW/x.jpg"
      )
    ).toBe(false);
  });
});
