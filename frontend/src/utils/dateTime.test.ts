import { describe, expect, it } from "vitest";
import { formatIctuDateTime, formatIctuTime, ictuInputToIso, toIctuDateTimeInput } from "./dateTime";

describe("ICTU date and time conversion", () => {
  it("converts a Vietnam wall-clock input to UTC independently of the host timezone", () => {
    expect(ictuInputToIso("2026-10-03T09:00")).toBe("2026-10-03T02:00:00.000Z");
  });

  it("always renders UTC API values in Asia/Ho_Chi_Minh", () => {
    expect(toIctuDateTimeInput("2026-10-03T02:00:00+00:00")).toBe("2026-10-03T09:00");
    expect(formatIctuTime("2026-10-03T01:00:00Z")).toBe("08:00");
    expect(formatIctuDateTime("2026-10-03T02:00:00Z")).toContain("09:00");
  });
});
