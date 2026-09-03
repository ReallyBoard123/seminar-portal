import Link from "next/link";

/**
 * The portal's nav.
 *
 * Identity comes from the session cookie now, so no token is threaded through
 * these links — signing in once covers every page.
 */

// The wordmark in the corner. One place to change; or wire it to
// config.shortName if you want it editable from the admin panel.
const BRAND = "Seminar";

const TABS = [
  { href: "/", label: "Overview" },
  { href: "/people", label: "Who does what" },
  { href: "/resources", label: "Resources" },
] as const;

export function PortalNav({
  active,
  signedInAs,
  isOrganizer,
  right,
}: {
  active?: string;
  /** Truthy when someone is signed in; the name itself is no longer shown. */
  signedInAs?: string;
  isOrganizer?: boolean;
  right?: React.ReactNode;
}) {
  const tabs = [
    ...TABS,
    ...(signedInAs ? ([{ href: "/me", label: "My submission" }] as const) : []),
    ...(isOrganizer ? [{ href: "/admin", label: "Organiser" } as const] : []),
  ];

  return (
    <div className="border-border/60 flex items-center justify-between border-b px-6 py-4 sm:px-12">
      <Link href="/" className="text-[15px] font-semibold tracking-tight">
        {BRAND}
      </Link>
      <div className="flex items-center gap-5">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`text-[13px] ${
              active === tab.href
                ? "text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </Link>
        ))}
        {!signedInAs && (
          <Link href="/signin" className="text-foreground text-[13px] font-medium">
            Sign in
          </Link>
        )}
        {right}
      </div>
    </div>
  );
}
