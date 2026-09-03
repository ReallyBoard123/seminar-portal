import { describe, expect, test } from "vitest";
import { z } from "zod";

import {
  arrayOf,
  httpUrl,
  optionalId,
  orcid,
  parseForm,
  pickPosted,
  round,
  sanitizeFilename,
  score,
  text,
} from "./forms";

function form(entries: [string, string][]): FormData {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
}

describe("httpUrl", () => {
  const schema = httpUrl("Homepage", 30);

  test.each(["https://example.org", "http://example.org/path?q=1", ""])(
    "accepts %s",
    (value) => {
      expect(schema.safeParse(value).success).toBe(true);
    },
  );

  // The reason this field is validated at all: it renders as an anchor on a
  // page the whole cohort reads.
  test.each([
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "data:text/html;base64,PHNjcmlwdD4=",
    "vbscript:msgbox",
    "file:///etc/passwd",
    "example.org",
  ])("refuses %s", (value) => {
    expect(schema.safeParse(value).success).toBe(false);
  });

  test("reports the length before the protocol when a value fails both", () => {
    const result = schema.safeParse(`javascript:${"a".repeat(60)}`);

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain("30 characters");
  });

  test("trims surrounding whitespace before judging the protocol", () => {
    expect(schema.safeParse("  https://example.org  ")).toMatchObject({
      success: true,
      data: "https://example.org",
    });
  });
});

describe("orcid", () => {
  test.each(["0000-0002-1825-0097", "0000-0002-1825-009X", ""])("accepts %s", (value) => {
    expect(orcid.safeParse(value).success).toBe(true);
  });

  test.each(["0000-0002-1825", "https://orcid.org/0000-0002-1825-0097", "0000000218250097"])(
    "refuses %s",
    (value) => {
      expect(orcid.safeParse(value).success).toBe(false);
    },
  );
});

describe("score", () => {
  test.each([0, 7])("accepts the boundary %i", (value) => {
    expect(score.safeParse(String(value))).toMatchObject({ success: true, data: value });
  });

  // Rejected, never clamped: an out-of-range score means the form is wrong.
  test.each(["-1", "8", "3.5"])("refuses %s", (value) => {
    expect(score.safeParse(value).success).toBe(false);
  });
});

describe("round", () => {
  test.each(["1", "2", "3"])("accepts %s", (value) => {
    expect(round.safeParse(value).success).toBe(true);
  });

  test.each(["0", "4", "two"])("refuses %s", (value) => {
    expect(round.safeParse(value).success).toBe(false);
  });
});

describe("optionalId", () => {
  test.each([
    ["", null],
    ["none", null],
    ["7", 7],
  ])("maps %s to %s", (input, expected) => {
    expect(optionalId.safeParse(input)).toMatchObject({ success: true, data: expected });
  });

  test("refuses a non-positive id", () => {
    expect(optionalId.safeParse("0").success).toBe(false);
  });
});

describe("arrayOf", () => {
  const schema = z.object({ tag: arrayOf(z.string().trim()) });

  test("reads a repeated field as a list", () => {
    const result = parseForm(schema, form([["tag", "a"], ["tag", "b"]]));

    expect(result).toMatchObject({ ok: true, data: { tag: ["a", "b"] } });
  });

  // FormData gives a bare string when a key appears once; without the
  // preprocess step that single row would fail the array schema.
  test("reads a single occurrence as a one-item list", () => {
    const result = parseForm(schema, form([["tag", "only"]]));

    expect(result).toMatchObject({ ok: true, data: { tag: ["only"] } });
  });

  test("reads an absent field as an empty list", () => {
    const result = parseForm(schema, form([]));

    expect(result).toMatchObject({ ok: true, data: { tag: [] } });
  });
});

describe("parseForm", () => {
  const schema = z.object({ title: text(10, "Title") });

  test("returns the field name and the message rather than throwing", () => {
    const result = parseForm(schema, form([["title", "far too long to fit"]]));

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toContain("title");
    expect(result.ok === false && result.message).toContain("10 characters");
  });

  test("trims accepted values", () => {
    expect(parseForm(schema, form([["title", "  hi  "]]))).toMatchObject({
      ok: true,
      data: { title: "hi" },
    });
  });
});

describe("sanitizeFilename", () => {
  test("keeps an ordinary name intact", () => {
    expect(sanitizeFilename("Seminar paper template.docx")).toBe("Seminar_paper_template.docx");
  });

  test("drops any path, so a name can never climb out of its blob prefix", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("C:\\Users\\me\\deck.pdf")).toBe("deck.pdf");
  });

  test("strips what would break a content-disposition header", () => {
    expect(sanitizeFilename('a"b\r\nX-Evil: 1.pdf')).toBe("a_b__X-Evil__1.pdf");
  });

  test("never returns an empty name", () => {
    expect(sanitizeFilename("...")).toBe("upload");
    expect(sanitizeFilename("")).toBe("upload");
  });

  test("caps the length", () => {
    expect(sanitizeFilename(`${"a".repeat(300)}.pdf`)).toHaveLength(120);
  });
});

describe("pickPosted", () => {
  // Schema defaults fill absent keys with "" — persisting those would erase
  // sibling canvases sharing the same blob. Only keys the form carried count.
  test("keeps only keys present in the FormData", () => {
    const data = { a: "typed", b: "" };
    const posted = pickPosted(data, form([["a", "typed"]]));
    expect(posted).toEqual({ a: "typed" });
  });

  test("keeps a posted empty string — clearing a cell is a real edit", () => {
    const posted = pickPosted({ a: "" }, form([["a", ""]]));
    expect(posted).toEqual({ a: "" });
  });
});
