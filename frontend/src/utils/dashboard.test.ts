import { describe, expect, it } from "vitest";
import type { Meeting } from "../types";
import { countPendingInvitations, scopeDashboardMeetings } from "./dashboard";

const meetings: Meeting[] = [
  {
    id: 1,
    title: "Lịch của Minh Anh",
    organizer_email: "minhanh@ictu.edu.vn",
    expected_attendees: 1,
    start_time: "2026-10-03T02:00:00Z",
    end_time: "2026-10-03T03:00:00Z",
    status: "scheduled",
    participants: [],
  },
  {
    id: 2,
    title: "Lịch mời Minh Anh",
    organizer_email: "leader@ictu.edu.vn",
    expected_attendees: 2,
    start_time: "2026-10-04T02:00:00Z",
    end_time: "2026-10-04T03:00:00Z",
    status: "scheduled",
    participants: [{ id: 1, email: "minhanh@ictu.edu.vn", status: "invited" }],
  },
  {
    id: 3,
    title: "Không liên quan",
    organizer_email: "other@ictu.edu.vn",
    expected_attendees: 2,
    start_time: "2026-10-05T02:00:00Z",
    end_time: "2026-10-05T03:00:00Z",
    status: "scheduled",
    participants: [{ id: 2, email: "leader@ictu.edu.vn", status: "invited" }],
  },
];

describe("dashboard role scope", () => {
  it("shows employees only meetings they organize or attend", () => {
    const scoped = scopeDashboardMeetings(meetings, "minhanh@ictu.edu.vn", false);
    expect(scoped.map((meeting) => meeting.id)).toEqual([1, 2]);
    expect(countPendingInvitations(scoped, "minhanh@ictu.edu.vn", false)).toBe(1);
  });

  it("shows administrators system-wide statistics", () => {
    const scoped = scopeDashboardMeetings(meetings, "leader@ictu.edu.vn", true);
    expect(scoped).toHaveLength(3);
    expect(countPendingInvitations(scoped, "leader@ictu.edu.vn", true)).toBe(2);
  });
});
