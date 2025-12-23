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

export const urlEmbedRequestSchema = z.object({
  namespace: z.string().trim().min(1).optional(),
  url: z.string().url().optional(),
  urls: z.array(z.string().url()).optional(),
}).refine((data) => data.url || (Array.isArray(data.urls) && data.urls.length > 0), {
  message: "Provide at least one valid URL in `url` or `urls`.",
});
