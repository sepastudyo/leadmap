"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

import { signIn } from "@/auth";
import { signUpSchema } from "@/lib/validation";
import { createUser, findUserByEmail, hashPassword } from "@/modules/auth";
import { EmailAlreadyExistsError } from "@/modules/shared";

export async function register(formData: FormData) {
  const parsed = signUpSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    redirect("/sign-up?error=InvalidInput");
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
