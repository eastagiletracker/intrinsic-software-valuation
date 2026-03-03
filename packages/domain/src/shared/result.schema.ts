import { z } from "zod";

import {
  ServiceErrorSchema,
  type ServiceError,
} from "./service-error.schema.js";

/**
 * Creates a discriminated union Result schema for any data type.
 *
 * Every service-to-pipeline boundary uses this pattern to return either
 * a typed success payload or a structured error — never raw exceptions.
 *
 * @example
 * ```typescript
 * const MyResultSchema = createResultSchema(MyDataSchema);
 * type MyResult = z.infer<typeof MyResultSchema>;
 *
 * // Type narrowing via discriminant:
 * if (result.success) {
 *   result.data;  // typed as MyData
 * } else {
 *   result.error; // typed as ServiceError
 * }
 * ```
 */
export function createResultSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.discriminatedUnion("success", [
    z
      .object({
        success: z
          .literal(true)
          .describe("Indicates the operation completed successfully"),
        data: dataSchema,
      })
      .describe("Successful result containing the operation output"),
    z
      .object({
        success: z.literal(false).describe("Indicates the operation failed"),
        error: ServiceErrorSchema,
      })
      .describe("Failed result containing a structured error"),
  ]);
}

/**
 * Generic Result type for manual type annotations where a Zod schema
 * is not needed (e.g. internal function signatures).
 *
 * Prefer `z.infer<>` on a schema created by `createResultSchema()` at
 * service boundaries where runtime validation matters.
 */
export type Result<T> =
  | { success: true; data: T }
  | { success: false; error: ServiceError };
