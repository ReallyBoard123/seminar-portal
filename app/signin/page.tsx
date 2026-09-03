import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { SignInForm } from "./SignInForm";
import { signOutAction } from "./actions";
import { PortalNav } from "../components/PortalNav";
import { currentParticipant, MIN_PIN_LENGTH } from "../lib/auth";

export default async function SeminarSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next = "" } = await searchParams;
  const me = await currentParticipant();

  return (
    <main className="min-h-screen">
      <PortalNav active="/signin" signedInAs={me?.name} isOrganizer={me?.isOrganizer} />
      <div className="mx-auto max-w-md px-6 py-20 sm:px-12">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{me ? "Signed in" : "Sign in"}</CardTitle>
          </CardHeader>
          <CardContent>
            {me ? (
              <div className="flex flex-col gap-4">
                <p className="text-sm">
                  You&apos;re signed in as <span className="text-foreground font-medium">{me.name}</span>.
                </p>
                <form action={signOutAction}>
                  <Button type="submit" variant="outline" size="sm">
                    <LogOut className="size-3.5" />
                    Sign out
                  </Button>
                </form>
              </div>
            ) : (
              <>
                <p className="text-muted-foreground text-sm">
                  The seminar password is the one shared with everyone at the kick-off; it is
                  asked once per device. Your last name is how the rest of the cohort finds you,
                  so it is printed on the roster and is not a secret — the PIN you set next is
                  what keeps your drafts yours, and an organiser can reset it if you forget.
                </p>
                <SignInForm minPinLength={MIN_PIN_LENGTH} next={next} />
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
