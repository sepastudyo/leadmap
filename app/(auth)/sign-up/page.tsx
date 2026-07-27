import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { register } from "./actions";

const errorMessages: Record<string, string> = {
  InvalidInput:
    "Enter a name, valid email, and a password of at least 8 characters.",
  EmailInUse: "An account with this email already exists.",
  CredentialsSignin:
    "Account created, but sign-in failed — try signing in directly.",
  RateLimited: "Too many attempts — try again in a few minutes.",
};

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="flex w-full max-w-sm flex-col gap-6">
      <h1 className="text-xl font-semibold">Create an account</h1>

      {error && (
        <p className="text-destructive text-sm">
          {errorMessages[error] ?? "Something went wrong. Please try again."}
        </p>
      )}

      <form action={register} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            name="name"
            type="text"
            required
            autoComplete="name"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>
        <Button type="submit">Create account</Button>
      </form>

      <p className="text-muted-foreground text-sm">
        Already have an account?{" "}
        <Link href="/sign-in" className="underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </div>
  );
}
