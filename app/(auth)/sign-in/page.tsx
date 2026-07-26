import Link from "next/link";

import { signIn } from "@/auth";
import { env } from "@/config/env";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { authenticate } from "./actions";

const errorMessages: Record<string, string> = {
  InvalidInput: "Enter a valid email and password.",
  CredentialsSignin: "Incorrect email or password.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="flex w-full max-w-sm flex-col gap-6">
      <h1 className="text-xl font-semibold">Sign in</h1>

      {error && (
        <p className="text-destructive text-sm">
          {errorMessages[error] ?? "Something went wrong. Please try again."}
        </p>
      )}

      <form action={authenticate} className="flex flex-col gap-4">
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
            autoComplete="current-password"
          />
        </div>
        <Button type="submit">Sign in</Button>
      </form>

      {(env.AUTH_GOOGLE_ID || env.AUTH_GITHUB_ID) && (
        <div className="flex flex-col gap-2">
          {env.AUTH_GOOGLE_ID && (
            <form
              action={async () => {
                "use server";
                await signIn("google", { redirectTo: "/" });
              }}
            >
              <Button type="submit" variant="outline" className="w-full">
                Continue with Google
              </Button>
            </form>
          )}
          {env.AUTH_GITHUB_ID && (
            <form
              action={async () => {
                "use server";
                await signIn("github", { redirectTo: "/" });
              }}
            >
              <Button type="submit" variant="outline" className="w-full">
                Continue with GitHub
              </Button>
            </form>
          )}
        </div>
      )}

      <p className="text-muted-foreground text-sm">
        No account?{" "}
        <Link href="/sign-up" className="underline underline-offset-4">
          Sign up
        </Link>
      </p>
    </div>
  );
}
