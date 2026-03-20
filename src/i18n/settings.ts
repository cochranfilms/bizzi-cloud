import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const defaultLocale = "en";

void i18n.use(initReactI18next).init({
  showSupportNotice: false,
  lng: defaultLocale,
  fallbackLng: defaultLocale,
  defaultNS: "common",
  ns: ["common", "loading", "trash", "admin"],
  interpolation: {
    escapeValue: false, // React escapes by default
  },
  resources: {
    en: {
      common: {
        // Shared copy - extend as needed
        loading: "Loading…",
        cancel: "Cancel",
        save: "Save",
        close: "Close",
        delete: "Delete",
        restore: "Restore",
      },
      loading: {
        default: "Loading…",
        files: "Loading files…",
        filesYour: "Loading your files…",
        shares: "Loading shares…",
        favorites: "Loading favorites…",
        galleries: "Loading your galleries…",
        transfer: "Loading transfer…",
        preview: "Loading preview…",
        comments: "Loading comments…",
        searching: "Searching…",
      },
      trash: {
        title: "Deleted",
        description:
          "Deleted files and folders are kept for 30 days before permanent deletion. Restore them to their original location or permanently delete them.",
        deletedFolders: "Deleted folders",
        deletedFiles: "Deleted files",
        emptyMessage:
          "No deleted files or folders. When you delete files or folders with contents from your drives, they will appear here.",
        restoreAction: "Restore to original location",
        permanentDelete: "Permanently delete",
        clearSelection: "Clear selection",
        dragToDelete: "Drag selected items here to permanently delete",
        selected: "{{count}} selected",
      },
      admin: {
        unauthorized: "Admin access required",
      },
    },
  },
});

export default i18n;
