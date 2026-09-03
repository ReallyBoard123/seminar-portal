import { describe, expect, test } from "vitest";

import { GROUP_NO_INSTITUTION, broadcastRecipients, institutionGroups } from "./broadcast";
import type { Participant } from "./types";

const person = (over: Partial<Participant>): Participant =>
  ({
    id: 1,
    edition: 32,
    name: "Someone",
    email: "s@example.org",
    institution: "University of Kassel",
    format: "poster",
    ...over,
  }) as Participant;

describe("institutionGroups", () => {
  test("one row per distinct institution, counting only reachable people", () => {
    const groups = institutionGroups([
      person({ id: 1, institution: "University of Kassel" }),
      person({ id: 2, institution: "University of Kassel", email: "" }),
      person({ id: 3, institution: "University of St.Gallen" }),
    ]);

    expect(groups).toEqual([
      { name: "University of Kassel", count: 1 },
      { name: "University of St.Gallen", count: 1 },
    ]);
  });

  test("a blank institution becomes its own named group", () => {
    const groups = institutionGroups([person({ institution: "  " })]);
    expect(groups).toEqual([{ name: GROUP_NO_INSTITUTION, count: 1 }]);
  });
});

describe("broadcastRecipients", () => {
  const roster = [
    person({ id: 1, institution: "University of Kassel" }),
    person({ id: 2, institution: "University of St.Gallen" }),
    person({ id: 3, institution: "TUM" }),
    person({ id: 4, institution: "University of Kassel", email: "" }),
  ];

  test("keeps only chosen groups", () => {
    const picked = broadcastRecipients(roster, ["University of Kassel", "TUM"]);
    expect(picked.map((p) => p.id)).toEqual([1, 3]);
  });

  // Someone with no address can't be reached; counting them as a recipient
  // would make "sent to N people" a lie.
  test("drops people with no email even in a chosen group", () => {
    const picked = broadcastRecipients(roster, ["University of Kassel"]);
    expect(picked.map((p) => p.id)).toEqual([1]);
  });

  test("no groups chosen means nobody", () => {
    expect(broadcastRecipients(roster, [])).toEqual([]);
  });
});
