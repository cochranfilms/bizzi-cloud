import * as fs from "fs";
import * as path from "path";
import * as util from "util";

let logFilePath: string | null = null;

function formatArg(arg: unknown): string {
  if (arg instanceof Error) {
    return arg.stack || `${arg.name}: ${arg.message}`;
  }
  if (typeof arg === "string") {
    return arg;
  }
  return util.inspect(arg, { depth: 4, breakLength: 120, maxArrayLength: 20 });
}

function write(level: "INFO" | "WARN" | "ERROR", args: unknown[]): void {
  const line = `[${new Date().toISOString()}] [${level}] ${args.map(formatArg).join(" ")}\n`;

  if (logFilePath) {
    try {
      fs.mkdirSync(path.dirname(logFilePath), { recursive: true });
      fs.appendFileSync(logFilePath, line, "utf8");
    } catch {
      // Logging must never crash the app.
    }
  }
}

export function setDesktopLogFile(filePath: string): void {
  logFilePath = filePath;
  write("INFO", ["Desktop logging initialized", { logFilePath }]);
}

export function getDesktopLogFile(): string | null {
  return logFilePath;
}

export const desktopLog = {
  info: (...args: unknown[]) => {
    console.log(...args);
    write("INFO", args);
  },
  warn: (...args: unknown[]) => {
    console.warn(...args);
    write("WARN", args);
  },
  error: (...args: unknown[]) => {
    console.error(...args);
    write("ERROR", args);
  },
};
