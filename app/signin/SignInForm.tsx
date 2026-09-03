"use client";

import { KeyRound, Lock, ShieldAlert, User } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { claimPinAction, signInAction, verifyPinAction, type SignInState } from "./actions";

const INITIAL: SignInState = { step: "login", ok: true, message: "" };

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-muted-foreground text-xs font-medium">{children}</label>;
}

function Message({ state }: { state: SignInState }) {
  if (!state.message) return null;
  return (
    <p className={cn("text-xs", state.ok ? "text-settled" : "text-destructive")}>{state.message}</p>
  );
}

/**
 * Two steps, driven entirely by what the server actions report.
 *
 * Step one asks who you are — seminar password and last name. Whether you
 * already have a PIN is then the app's question to answer, not yours, so
 * step two is either "enter your PIN" or "choose one", and nobody is ever
 * asked to leave a field blank to mean something.
 */
export function SignInForm({ minPinLength, next = "" }: { minPinLength: number; next?: string }) {
  const [loginState, loginAction, loginPending] = useActionState(signInAction, INITIAL);
  const [pinState, pinAction, pinPending] = useActionState(verifyPinAction, INITIAL);
  const [claimState, claimAction, claimPending] = useActionState(claimPinAction, INITIAL);

  // Whichever action most recently reported "claim" wins. A claim attempt
  // that finds the name was claimed out from under it reports "login"
  // instead, which correctly drops back to the ordinary form.
  const claiming =
    claimState.step === "claim"
      ? claimState
      : pinState.step === "claim"
        ? pinState
        : loginState.step === "claim"
          ? loginState
          : null;

  // The PIN step survives a wrong attempt: verifyPinAction reports "pin"
  // again with the name intact, so the person is not sent back to the start.
  const enteringPin =
    !claiming && (pinState.step === "pin" ? pinState : loginState.step === "pin" ? loginState : null);

  if (claiming) {
    return (
      <form action={claimAction} className="mt-6 flex flex-col gap-4">
        <input type="hidden" name="name" value={claiming.name} />
        <input type="hidden" name="next" value={next} />
        <p className="text-sm">
          First time signing in as <span className="text-foreground font-medium">{claiming.name}</span>.
          Choose a PIN — it&apos;s yours from now on, and the organiser can reset it if you forget.
        </p>
        <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
          <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
          Your name isn&apos;t a secret — it&apos;s on the roster for everyone to see. This PIN is what
          actually protects your drafts, so don&apos;t use something like {"“"}123456{"”"}.
        </p>

        <div className="flex flex-col gap-1.5">
          <FieldLabel>New PIN (min. {minPinLength} characters)</FieldLabel>
          <Input
            type="password"
            name="pin"
            autoComplete="new-password"
            minLength={minPinLength}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <FieldLabel>Confirm PIN</FieldLabel>
          <Input
            type="password"
            name="pinConfirm"
            autoComplete="new-password"
            minLength={minPinLength}
            required
          />
        </div>

        <Message state={claimState} />

        <Button type="submit" disabled={claimPending}>
          {claimPending ? "Setting your PIN…" : "Set PIN and sign in"}
        </Button>
      </form>
    );
  }

  if (enteringPin) {
    return (
      <form action={pinAction} className="mt-6 flex flex-col gap-4">
        <input type="hidden" name="name" value={enteringPin.name} />
        <input type="hidden" name="next" value={next} />
        <p className="text-sm">
          Welcome back, <span className="text-foreground font-medium">{enteringPin.name}</span>.
        </p>
        <div className="flex flex-col gap-1.5">
          <FieldLabel>Your PIN</FieldLabel>
          <div className="relative">
            <KeyRound className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
            <Input
              type="password"
              name="pin"
              autoComplete="current-password"
              autoFocus
              required
              className="pl-8"
            />
          </div>
        </div>
        <Message state={pinState} />
        <Button type="submit" disabled={pinPending}>
          {pinPending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    );
  }

  return (
    <form action={loginAction} className="mt-6 flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <FieldLabel>Seminar password</FieldLabel>
        <div className="relative">
          <Lock className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
          <Input
            type="password"
            name="seminarPassword"
            autoComplete="off"
            className="pl-8"
          />
        </div>
        <p className="text-muted-foreground text-xs">
          The one shared with everyone at the kick-off. Asked once per device.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <FieldLabel>Last name</FieldLabel>
        <div className="relative">
          <User className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
          <Input name="name" autoComplete="username" autoFocus required className="pl-8" />
        </div>
      </div>

      <Message state={loginState} />

      <Button type="submit" disabled={loginPending}>
        {loginPending ? "Checking…" : "Continue"}
      </Button>
    </form>
  );
}
