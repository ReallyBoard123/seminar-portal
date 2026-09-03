/**
 * Citations and bare URLs inside prose become links.
 *
 * The seminar's notes name real literature — "Van de Ven (2007)" on every
 * discussant explainer — and a reader should be one click from the source.
 * The organiser's stored text stays plain: known citations are linked by
 * lookup here, and anything that is already an http(s) URL is linked as
 * itself. Nothing else is touched, so free text cannot smuggle in markup.
 */

const KNOWN_REFS: Record<string, string> = {
  // Engaged Scholarship — the discussant criteria.
  "Van de Ven (2007)": "https://doi.org/10.1093/oso/9780199226290.001.0001",
  // The revision-phase guide handed out by the seminar.
  "Pang & Thatcher (2023)": "https://doi.org/10.17705/1jais.00797",
  "Pang and Thatcher (2023)": "https://doi.org/10.17705/1jais.00797",
  // The response-writing companion piece.
  "Rogers et al. (2026)": "https://doi.org/10.5465/amr.2026.0147",
  // The Pitching Research Canvas is this template, near verbatim.
  "Faff (2015)": "https://doi.org/10.1111/acfi.12116",
};

const SPLITTER = new RegExp(
  `(${[...Object.keys(KNOWN_REFS).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "https?://[^\\s)]+"].join("|")})`,
  "g",
);

const link = (href: string, label: string, key: number) => (
  <a
    key={key}
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="decoration-border hover:decoration-foreground underline underline-offset-2"
  >
    {label}
  </a>
);

/** Prose with citations and URLs rendered as links. */
export function Refs({ text }: { text: string }) {
  return (
    <>
      {text.split(SPLITTER).map((part, i) => {
        if (KNOWN_REFS[part]) return link(KNOWN_REFS[part], part, i);
        if (/^https?:\/\//.test(part)) return link(part, part, i);
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
