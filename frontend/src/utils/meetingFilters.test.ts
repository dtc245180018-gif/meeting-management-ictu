import { describe, expect, it } from "vitest";
import type { Meeting, Room } from "../types";
import { filterMeetings, filterRooms, getBookedRoomIds } from "./meetingFilters";

const meeting = (overrides: Partial<Meeting> = {}): Meeting => ({
  id: 1,
  title: "Sprint review",
  description: "",
  organizer_email: "leader@example.com",
  start_time: "2026-10-01T09:00:00+07:00",
  end_time: "2026-10-01T10:00:00+07:00",
  recurrence: undefined,
  recurrence_group: undefined,
  status: "scheduled",
  participants: [{ id: 1, email: "member@ictu.edu.vn", status: "invited" }],
  ...overrides,
});

const rooms: Room[] = [
  { id: 1, name: "A101", capacity: 6, location: "Tầng 1" },
  { id: 2, name: "A203", capacity: 12, location: "Tầng 2" },
];

describe("meeting filters", () => {
  it("filters a user's history by participant, status, and date", () => {
    expect(filterMeetings([meeting(), meeting({ id: 2, status: "cancelled", start_time: "2026-11-01T09:00:00+07:00" })], {
      email: "member@ictu.edu.vn",
      status: "scheduled",
      from: "2026-10-01",
      to: "2026-10-31",
    })).toHaveLength(1);
  });
});

describe("room status filters", () => {
  it("marks only active bookings as booked and filters the catalog", () => {
    const booked = getBookedRoomIds([meeting({ booking: {
      id: 1,
      room_id: 1,
      meeting_id: 1,
      start_time: "2026-10-01T09:00:00+07:00",
      end_time: "2026-10-01T10:00:00+07:00",
      status: "active",
      room: rooms[0],
    } })]);
    expect([...booked]).toEqual([1]);
    expect(filterRooms(rooms, booked, "booked").map((room) => room.id)).toEqual([1]);
    expect(filterRooms(rooms, booked, "free").map((room) => room.id)).toEqual([2]);
  });
});
