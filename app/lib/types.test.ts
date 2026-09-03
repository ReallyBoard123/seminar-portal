import { describe, expect, test } from "vitest";

import { daysUntil, isFormatKey, nextMilestone, publicParticipant } from "./types";
import type { Milestone, Participant } from "./types";

describe("daysUntil", () => {
  test("returns a positive count for a date in the future", () => {
    const now = new Date("2026-09-02T12:00:00Z");

    const result = daysUntil("2026-09-05", now);

    expect(result).toBe(3);
  });

  test("returns 0 for today, regardless of the time of day", () => {
    const now = new Date("2026-09-02T23:59:00Z");

    const result = daysUntil("2026-09-02", now);

    expect(result).toBe(0);
  });

  test("returns a negative count for a date in the past", () => {
    const now = new Date("2026-09-02T00:00:00Z");

    const result = daysUntil("2026-08-30", now);

    expect(result).toBe(-3);
  });

  test("returns NaN for an unparseable date string", () => {
    const now = new Date("2026-09-02T00:00:00Z");

    const result = daysUntil("not-a-date", now);

    expect(result).toBeNaN();
  });
});

describe("nextMilestone", () => {
  const milestone = (key: string, dueOn: string): Milestone => ({
    key,
    label: key,
    dueOn,
    description: "",
  });

  test("picks the earliest milestone still ahead even when the input array is out of order", () => {
    const now = new Date("2026-09-05T00:00:00Z");
    const milestones = [
      milestone("workshop", "2026-09-23"),
      milestone("kickoff", "2026-08-10"),
      milestone("submission_1", "2026-09-04"),
      milestone("submission_2", "2026-09-11"),
    ];

    const result = nextMilestone(milestones, now);

    expect(result?.key).toBe("submission_2");
  });

  test("returns the last milestone once every date is past", () => {
    const now = new Date("2026-12-01T00:00:00Z");
    const milestones = [milestone("kickoff", "2026-08-10"), milestone("workshop", "2026-09-23")];

    const result = nextMilestone(milestones, now);

    expect(result?.key).toBe("workshop");
  });

  test("returns null on an empty array", () => {
    const now = new Date("2026-09-05T00:00:00Z");

    const result = nextMilestone([], now);

    expect(result).toBeNull();
  });

  test("does not mutate the array it was given", () => {
    const now = new Date("2026-09-05T00:00:00Z");
    const milestones = [milestone("workshop", "2026-09-23"), milestone("kickoff", "2026-08-10")];
    const original = [...milestones];

    nextMilestone(milestones, now);

    expect(milestones).toEqual(original);
  });
});

describe("isFormatKey", () => {
  test("returns true for a known format key", () => {
    const result = isFormatKey("short_paper");

    expect(result).toBe(true);
  });

  test("returns false for a string that is not a format key", () => {
    const result = isFormatKey("keynote");

    expect(result).toBe(false);
  });

  test("returns false for an empty string", () => {
    const result = isFormatKey("");

    expect(result).toBe(false);
  });
});

describe("publicParticipant", () => {
  test("strips every secret while keeping the fields other participants may see", () => {
    const participant: Participant = {
      id: 1,
      edition: 32,
      name: "Ada Lovelace",
      email: "ada@example.com",
      institution: "University of Kassel",
      format: "short_paper",
      token: "secret-token",
      reviewer1Id: 2,
      reviewer2Id: null,
      postdocReviewer: "",
      discussantId: null,
      isOrganizer: false,
      isAdmin: false,
      createdAt: "2026-08-10T00:00:00.000Z",
      pinHash: "pbkdf2$sha256$210000$c2FsdA==$aGFzaA==",
      claimedAt: "2026-08-11T00:00:00.000Z",
      workingTitle: "On the Analytical Engine",
      interests: "computation, symbolic logic",
      methods: "formal analysis",
      phase: "writing up",
      bio: "Works on general-purpose computation.",
      homepageUrl: "https://example.org/ada",
      scholarUrl: "",
      orcid: "0000-0000-0000-0001",
    };

    const result = publicParticipant(participant);

    expect(result).toEqual({
      id: 1,
      edition: 32,
      name: "Ada Lovelace",
      institution: "University of Kassel",
      format: "short_paper",
      reviewer1Id: 2,
      reviewer2Id: null,
      postdocReviewer: "",
      discussantId: null,
      isOrganizer: false,
      isAdmin: false,
      createdAt: "2026-08-10T00:00:00.000Z",
      workingTitle: "On the Analytical Engine",
      interests: "computation, symbolic logic",
      methods: "formal analysis",
      phase: "writing up",
      bio: "Works on general-purpose computation.",
      homepageUrl: "https://example.org/ada",
      scholarUrl: "",
      orcid: "0000-0000-0000-0001",
    });
    expect(result).not.toHaveProperty("token");
    expect(result).not.toHaveProperty("email");
    expect(result).not.toHaveProperty("pinHash");
    expect(result).not.toHaveProperty("claimedAt");
  });
});
