import { currentParticipant } from "@/app/lib/auth";
import { readConfig } from "@/app/lib/config";
import { listEvents, listFiles, listParticipants } from "@/app/lib/db";
import { Separator } from "@/components/ui/separator";

import { PortalNav } from "../components/PortalNav";
import { AuditTrail } from "./AuditTrail";
import { CompletionMatrix } from "./CompletionMatrix";
import { ConfigPanel } from "./ConfigPanel";
import { ImportPanel } from "./ImportPanel";
import { institutionGroups } from "@/app/lib/broadcast";

import { BroadcastPanel } from "./BroadcastPanel";
import { MailPanel } from "./MailPanel";
import { ParticipantsPanel } from "./ParticipantsPanel";

/**
 * The organiser's page. Reached as /admin once signed in as one.
 *
 * Two access states before the real one:
 *  - Zero participants: nobody can be signed in as organiser yet, so the
 *    import panel renders with no session at all. The moment an import
 *    creates the first participant, this branch stops being reachable — see
 *    `bootstrapImport` in actions.ts, which re-checks the same thing
 *    server-side rather than trusting this render.
 *  - A session that's missing, unknown, or not an organiser: one plain
 *    "not authorised" state, the three cases left indistinguishable on
 *    purpose.
 */
export default async function SeminarAdminPage() {
  const config = await readConfig();
  const participants = await listParticipants(config.edition);

  if (participants.length === 0) {
    return (
      <main className="min-h-screen">
        <PortalNav />
        <div className="mx-auto max-w-2xl px-6 py-16 sm:px-12">
          <h1 className="text-2xl font-semibold tracking-tight">Set up {config.shortName} {config.edition}</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            No participants yet, so there is no organiser token to sign in with. Import the roster
            once — whoever is listed first becomes the organiser and gets an admin link back.
          </p>
          <div className="mt-8">
            <ImportPanel mode="bootstrap" />
          </div>
        </div>
      </main>
    );
  }

  const viewer = await currentParticipant();
  if (!viewer || !(viewer.isOrganizer || viewer.isAdmin)) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <p className="text-muted-foreground text-sm">Not authorised.</p>
      </main>
    );
  }

  const [files, events] = await Promise.all([
    listFiles(config.edition),
    listEvents(config.edition),
  ]);
  // Being an organiser is a permission, not a role in the seminar: some of
  // them present too. Only faculty accounts, which carry no format, drop out.
  const roster = participants.filter((p) => !p.isOrganizer || p.format !== "");

  return (
    <main className="min-h-screen">
      <PortalNav active="/admin" signedInAs={viewer.name} isOrganizer />
      <div className="mx-auto max-w-6xl px-6 py-8 sm:px-12">
        <header className="mb-10">
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            Organiser · Edition {config.edition}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{config.title}</h1>
        </header>

        <section>
          {/* The whole roster, not the presenting subset: a broadcast about
              the schedule should reach faculty too. */}
          <BroadcastPanel groups={institutionGroups(participants)} />
        </section>

        <Separator className="my-12" />

        <section>
          <h2 className="font-heading mb-4 text-lg font-semibold tracking-tight">Completion</h2>
          <CompletionMatrix participants={roster} files={files} milestones={config.milestones} />
        </section>

        <Separator className="my-12" />

        <section>
          <h2 className="font-heading mb-4 text-lg font-semibold tracking-tight">Participants</h2>
          {/* The whole roster, not the presenting subset: this is where an
              admin edits rights, emails and PIN resets, and a faculty
              organiser (no format, so absent from `roster`) has all three —
              including the bootstrap account, which would otherwise be
              unmanageable from here. */}
          <ParticipantsPanel participants={participants} viewerIsAdmin={viewer.isAdmin} />
        </section>

        <Separator className="my-12" />

        <section>
          <ImportPanel mode="organizer" />
        </section>

        <Separator className="my-12" />

        <section>
          <MailPanel participants={roster} files={files} milestones={config.milestones} />
        </section>

        <Separator className="my-12" />

        <section>
          <ConfigPanel config={config} />
        </section>

        <Separator className="my-12" />

        <section>
          <AuditTrail events={events} participants={participants} />
        </section>
      </div>
    </main>
  );
}
