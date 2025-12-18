import {z} from "zod";

// Validation for embed requests
export const embedRequestSchema = z.object({
  namespace: z.string().trim().min(1, "namespace is required"),
  uploads: z
    .array(
      z.object({
        name: z.string().trim().min(1, "file name is required"),
        buffer: z.any(),
        namespace: z.string().trim().min(1, "namespace is required").optional(),
      })
    )
    .min(1, "file is required"),
});
