import { describe, expect, test } from "vitest";

import { nameKeys, normaliseNameInput } from "./names";

// The real roster contains Müller, and both Grau and Grauer, so those three
// names are the fixtures throughout rather than made-up ones.

describe("Müller spellings", () => {
  test.each(["muller", "mueller", "Müller", "MÜLLER"])(
    "%s is matched by nameKeys for Anna Müller",
    (typed) => {
      expect(nameKeys("Anna Müller")).toContain(normaliseNameInput(typed));
    },
  );
});

describe("Grau and Grauer never cross-match", () => {
  test("typing Grau does not match Grauer's keys", () => {
    expect(nameKeys("Peter Grauer")).not.toContain(normaliseNameInput("Grau"));
  });

  test("typing Grauer does not match Grau's keys", () => {
    expect(nameKeys("Peter Grau")).not.toContain(normaliseNameInput("Grauer"));
  });

  test("each name still matches itself", () => {
    expect(nameKeys("Peter Grau")).toContain(normaliseNameInput("Grau"));
    expect(nameKeys("Peter Grauer")).toContain(normaliseNameInput("Grauer"));
  });

  test("a prefix of Grauer's full name does not match Grau", () => {
    // Guards specifically against a prefix-match regression: "Grau" is a
    // prefix of "Grauer", so equality (not startsWith) must be what's used.
    expect(nameKeys("Peter Grau")).not.toContain(normaliseNameInput("Grauer"));
  });
});

describe("last name and full name both match", () => {
  test("last name alone matches", () => {
    expect(nameKeys("Ada Lovelace")).toContain(normaliseNameInput("Lovelace"));
  });

  test("full name matches", () => {
    expect(nameKeys("Ada Lovelace")).toContain(normaliseNameInput("Ada Lovelace"));
  });

  test("first name alone does not match", () => {
    expect(nameKeys("Ada Lovelace")).not.toContain(normaliseNameInput("Ada"));
  });
});

describe("case and surrounding whitespace are ignored", () => {
  test("case is ignored", () => {
    expect(normaliseNameInput("LOVELACE")).toBe(normaliseNameInput("lovelace"));
  });

  test("surrounding whitespace is ignored", () => {
    expect(normaliseNameInput("   Lovelace   ")).toBe(normaliseNameInput("Lovelace"));
  });
});

describe("hyphenated and apostrophed names normalise consistently", () => {
  test("a hyphenated last name matches between nameKeys and normaliseNameInput", () => {
    expect(nameKeys("Anne-Marie Weber-Schmidt")).toContain(normaliseNameInput("Weber-Schmidt"));
  });

  test("an apostrophed last name matches between nameKeys and normaliseNameInput", () => {
    expect(nameKeys("Sean O'Brien")).toContain(normaliseNameInput("O'Brien"));
  });
});

describe("empty or punctuation-only input", () => {
  test.each(["", "   ", "!!!", "-- ''"])("%j normalises to the empty string", (input) => {
    expect(normaliseNameInput(input)).toBe("");
  });

  test("nameKeys never contains the empty string, so empty input can't match anyone", () => {
    expect(nameKeys("Ada Lovelace")).not.toContain("");
  });
});

describe("nameKeys never returns duplicate entries", () => {
  test("for a name with no diacritics", () => {
    const keys = nameKeys("Ada Lovelace");
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("for a single-word name where the last-name and full-name variants collide", () => {
    const keys = nameKeys("Müller");
    expect(new Set(keys).size).toBe(keys.length);
  });
});
