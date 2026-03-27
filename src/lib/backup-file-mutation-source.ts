/**
 * Attribution for backup_files trash / restore / purge — every server mutation should log this.
 */
export type BackupFileMutationSource = "web" | "mount" | "gallery" | "cron" | "admin" | "worker";
