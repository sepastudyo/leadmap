"use server";

import { AuthError } from "next-auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { signIn } from "@/auth";
import {
  AUTH_SIGNUP_RATE_LIMIT_MAX,
  AUTH_SIGNUP_RATE_LIMIT_WINDOW_MS,
} from "@/config/constants";
import { checkRateLimit } from "@/lib/rate-limit";
import { signUpSchema } from "@/lib/validation";
import { createUser, findUserByEmail, hashPassword } from "@/modules/auth";
import { EmailAlreadyExistsError } from "@/modules/shared";

function requestIp(headersList: Headers): string {
  const forwardedFor = headersList.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]!.trim();
  return headersList.get("x-real-ip") ?? "unknown";
}

export async function register(formData: FormData) {
  const parsed = signUpSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    redirect("/sign-up?error=InvalidInput");
  }

  // architecture.md §13.1 "lockout/rate limiting on auth routes" —
  // keyed by IP since an unauthenticated caller has no user id yet.
  const rateLimit = await checkRateLimit(
    requestIp(await headers()),
    "auth.signup",
    {
      limit: AUTH_SIGNUP_RATE_LIMIT_MAX,
      windowMs: AUTH_SIGNUP_RATE_LIMIT_WINDOW_MS,
    },
  );

  if (!rateLimit.allowed) {
    redirect("/sign-up?error=RateLimited");
  }

  const existing = await findUserByEmail(parsed.data.email);
  if (existing) {
    redirect("/sign-up?error=EmailInUse");
  }

  const passwordHash = await hashPassword(parsed.data.password);

  try {
    await createUser({
      email: parsed.data.email,
      name: parsed.data.name,
      passwordHash,
      authProvider: "credentials",
    });
  } catch (error) {
    if (error instanceof EmailAlreadyExistsError) {
      redirect("/sign-up?error=EmailInUse");
    }
    throw error;
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
