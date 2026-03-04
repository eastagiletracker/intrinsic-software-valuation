import type { ArchitectureScannerPort } from "./port.js";
import { ArchitectureScannerService } from "./service.js";

/**
 * Create an Architecture Scanner service instance.
 *
 * @returns A configured `ArchitectureScannerPort`.
 */
export function createArchitectureScanner(): ArchitectureScannerPort {
  return new ArchitectureScannerService();
}
