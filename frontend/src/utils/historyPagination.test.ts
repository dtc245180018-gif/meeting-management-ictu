import { describe, expect, it } from "vitest";
import type { Meeting } from "../types";
import { loadAllHistory } from "./historyPagination";

const item = (id: number): Meeting => ({
  id,
  title: `Cuộc họp ${id}`,
  organizer_email: "leader@ictu.edu.vn",
  expected_attendees: 1,
  start_time: "2026-10-01T02:00:00Z",
  end_time: "2026-10-01T03:00:00Z",
  status: "scheduled",
  participants: [],
});

describe("history pagination", () => {
  it("loads all records beyond the API page size", async () => {
    const records = Array.from({ length: 101 }, (_, index) => item(index + 1));
    const calls: number[] = [];
    const result = await loadAllHistory(async (offset, limit) => {
      calls.push(offset);
      return records.slice(offset, offset + limit);
    });
    expect(result).toHaveLength(101);
    expect(calls).toEqual([0, 100]);
  });
});
