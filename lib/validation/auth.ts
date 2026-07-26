import { z } from "zod";

/**
 * Zod schemas for the Auth.js sign-in/sign-up boundary (architecture.md
 * §13.3 "Zod at every boundary"). Password minimum length (8) isn't
 * specified anywhere in architecture.md; it's a standard baseline
 * (NIST 800-63B) chosen in the absence of a stated one.
 */
const email = z.string().trim().toLowerCase().pipe(z.email());

export const signUpSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  email,
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const signInSchema = z.object({
  email,
  password: z.string().min(1, "Password is required"),
});
