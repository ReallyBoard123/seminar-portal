import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { currentParticipant } from "@/app/lib/auth";
import { readConfig } from "@/app/lib/config";
import { listFiles, listParticipants } from "@/app/lib/db";
import {
  FORMAT_KEYS,
  publicParticipant,
  type FormatRule,
  type PublicParticipant,
  type Round,
  type SeminarConfig,
} from "@/app/lib/types";

import { SubmissionDots } from "../components/SubmissionDots";
import { PortalNav } from "../components/PortalNav";

const NOT_PICKED = <span className="text-muted-foreground italic">not picked yet</span>;


/** The name links to the person's official staff page when we have one —
 *  the roster is where you wonder who somebody is, so that is where the
 *  answer belongs. Plain text otherwise. */
function PersonName({ name, url }: { name: string; url: string }) {
  if (!url) return <>{name}</>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="decoration-border hover:decoration-foreground underline underline-offset-3"
    >
      {name}
    </a>
  );
}

export default async function SeminarPeoplePage() {
  const config = await readConfig();
  const [participants, files, viewer] = await Promise.all([
    listParticipants(config.edition),
    listFiles(config.edition),
    currentParticipant(),
  ]);

  return (
    <main className="min-h-screen">
      <PortalNav active="/people" signedInAs={viewer?.name} isOrganizer={viewer?.isOrganizer || viewer?.isAdmin} />
      <div className="mx-auto max-w-5xl px-6 py-8 sm:px-12">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Who does what</h1>
          <p className="text-muted-foreground mt-1 text-[13px]">
            Formats, reviewer assignments and submission status for edition {config.edition}.
          </p>
        </header>

        {participants.length === 0 ? (
          <p className="text-muted-foreground mt-10 text-sm">
            No participants imported yet. An organiser can bring in the roster from{" "}
            <Link href="/admin" className="underline underline-offset-3 hover:text-foreground">
              the admin page
            </Link>
            .
          </p>
        ) : (
          <PeopleByFormat
            config={config}
            participants={participants.map(publicParticipant)}
            files={files}
            viewerId={viewer?.id ?? null}
            formats={config.formats}
          />
        )}
      </div>
    </main>
  );
}

function PeopleByFormat({
  participants,
  files,
  viewerId,
  formats,
  config,
}: {
  participants: PublicParticipant[];
  files: Awaited<ReturnType<typeof listFiles>>;
  viewerId: number | null;
  formats: FormatRule[];
  config: SeminarConfig;
}) {
  const byId = new Map(participants.map((p) => [p.id, p]));
  const nameOf = (id: number | null) => (id === null ? NOT_PICKED : (byId.get(id)?.name ?? `#${id}`));
  const labelOf = (key: string) => formats.find((f) => f.key === key)?.label ?? key;

  const submitted = new Map<number, Set<Round>>();
  for (const f of files) {
    if (f.kind !== "submission") continue;
    const rounds = submitted.get(f.participantId) ?? new Set<Round>();
    rounds.add(f.round);
    submitted.set(f.participantId, rounds);
  }

  // A student without a format is a gap worth showing; a faculty account
  // without one is just Janson and Leimeister, who are not presenting and do
  // not belong on a roster of deliverables.
  const unassigned = participants.filter(
    (p) => p.format === "" && !p.isOrganizer && !p.isAdmin,
  );
  const groups = FORMAT_KEYS.map((key) => ({
    key,
    label: labelOf(key),
    rows: participants.filter((p) => p.format === key),
  })).filter((g) => g.rows.length > 0);

  return (
    <div className="mt-10 space-y-12">
      {groups.map((g) => (
        <section key={g.key}>
          <h2 className="text-muted-foreground mb-3 border-b border-border/60 pb-1.5 text-xs font-semibold tracking-wide uppercase">
            {g.label} ({g.rows.length})
          </h2>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Institution</TableHead>
                  <TableHead>Reviewer 1</TableHead>
                  {config.reviewerCount === 2 && <TableHead>Reviewer 2</TableHead>}
                  {config.useDiscussant && <TableHead>Discussant</TableHead>}
                  <TableHead>Submissions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {g.rows.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      <span className="inline-flex items-center gap-2">
                        <PersonName name={p.name} url={p.homepageUrl} />
                        {p.id === viewerId && (
                          <Badge variant="secondary" className="text-[10px]">
                            you
                          </Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{p.institution || "—"}</TableCell>
                    <TableCell>{nameOf(p.reviewer1Id)}</TableCell>
                    {config.reviewerCount === 2 && <TableCell>{nameOf(p.reviewer2Id)}</TableCell>}
                    {config.useDiscussant && <TableCell>{nameOf(p.discussantId)}</TableCell>}
                    <TableCell>
                      <SubmissionDots rounds={submitted.get(p.id) ?? new Set<Round>()} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ))}

      {unassigned.length > 0 && (
        <section>
          <h2 className="text-muted-foreground mb-3 border-b border-border/60 pb-1.5 text-xs font-semibold tracking-wide uppercase">
            Format not assigned yet ({unassigned.length})
          </h2>
          <ul className="space-y-1 text-sm">
            {unassigned.map((p) => (
              <li key={p.id} className="flex items-center gap-2">
                <PersonName name={p.name} url={p.homepageUrl} />
                {p.id === viewerId && (
                  <Badge variant="secondary" className="text-[10px]">
                    you
                  </Badge>
                )}
                <span className="text-muted-foreground">{p.institution}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
