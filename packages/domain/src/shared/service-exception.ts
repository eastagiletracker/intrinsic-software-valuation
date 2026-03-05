import type { ServiceError } from "./service-error.schema.js";

/**
 * Throwable Error subclass that carries all {@link ServiceError} fields.
 *
 * Use this instead of throwing plain `ServiceError` objects so that
 * standard error-handling infrastructure (`instanceof Error`, `p-retry`,
 * stack traces) works correctly while preserving the structured
 * `code` / `source` / `context` metadata.
 */
export class ServiceException extends Error implements ServiceError {
  readonly code: string;
  readonly source: string;
  readonly context?: unknown;

  constructor(
    code: string,
    message: string,
    source: string,
    context?: unknown,
  ) {
    super(message);
    this.name = "ServiceException";
    this.code = code;
    this.source = source;
    this.context = context;
  }
}
