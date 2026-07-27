"use server";

import { AuthError } from "next-auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { signIn } from "@/auth";
import {
  AUTH_SIGNIN_RATE_LIMIT_MAX,
  AUTH_SIGNIN_RATE_LIMIT_WINDOW_MS,
} from "@/config/constants";
import { checkRateLimit } from "@/lib/rate-limit";
import { signInSchema } from "@/lib/validation";

function requestIp(headersList: Headers): string {
  const forwardedFor = headersList.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]!.trim();
  return headersList.get("x-real-ip") ?? "unknown";
}

export async function authenticate(formData: FormData) {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    redirect("/sign-in?error=InvalidInput");
  }

  // architecture.md §13.1 "lockout/rate limiting on auth routes" —
  // keyed by IP since an unauthenticated caller has no user id yet.
  const rateLimit = await checkRateLimit(
    requestIp(await headers()),
    "auth.signin",
    {
      limit: AUTH_SIGNIN_RATE_LIMIT_MAX,
      windowMs: AUTH_SIGNIN_RATE_LIMIT_WINDOW_MS,
    },
  );

  if (!rateLimit.allowed) {
    redirect("/sign-in?error=RateLimited");
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: "/",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect("/sign-in?error=CredentialsSignin");
    }
    throw error;
  }
}
