import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Account, Meeting } from "../types";
import { formatIctuTime, ICTU_TIME_ZONE } from "../utils/dateTime";
import { MeetingList } from "./MeetingList";


type CalendarScope = "all" | "mine" | "invited";
type CalendarView = "month" | "week" | "day";


interface Props {
  meetings: Meeting[];
  account: Account;
  onChanged: () => void;
  focusMeetingId?: number | null;
  onFocusHandled?: () => void;
  advancedContent?: ReactNode;
}


const weekdays = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];


function dateKey(value: Date | string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ICTU_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(typeof value === "string" ? new Date(value) : value);
}


function dateFromKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}


function startOfWeek(value: Date) {
  const result = new Date(value);
  result.setHours(12, 0, 0, 0);
  result.setDate(result.getDate() - result.getDay());
  return result;
}


function addDays(value: Date, amount: number) {
  const result = new Date(value);
  result.setDate(result.getDate() + amount);
  return result;
}


function longDate(value: Date) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: ICTU_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(value);
}


function titleForRange(cursor: Date, view: CalendarView) {
  if (view === "month") return `Tháng ${cursor.getMonth() + 1} năm ${cursor.getFullYear()}`;
  if (view === "day") return longDate(cursor);
  const first = startOfWeek(cursor);
  const last = addDays(first, 6);
  const formatter = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit" });
  return `${formatter.format(first)} – ${formatter.format(last)}, ${last.getFullYear()}`;
}


export function MeetingCalendar({ meetings, account, onChanged, focusMeetingId, onFocusHandled, advancedContent }: Props) {
  const today = useMemo(() => dateFromKey(dateKey(new Date())), []);
  const [scope, setScope] = useState<CalendarScope>("all");
  const [view, setView] = useState<CalendarView>("month");
  const [cursor, setCursor] = useState(today);
  const [selectedDate, setSelectedDate] = useState(dateKey(today));

  const scopedMeetings = useMemo(() => {
    const email = account.email.toLowerCase();
    return meetings
      .filter((meeting) => scope === "all"
        || (scope === "mine" && meeting.organizer_email.toLowerCase() === email)
        || (scope === "invited" && meeting.participants.some((participant) => participant.email.toLowerCase() === email)))
      .sort((left, right) => new Date(left.start_time).getTime() - new Date(right.start_time).getTime());
  }, [account.email, meetings, scope]);

  const meetingsByDate = useMemo(() => {
    const grouped = new Map<string, Meeting[]>();
    scopedMeetings.forEach((meeting) => {
      const key = dateKey(meeting.start_time);
      grouped.set(key, [...(grouped.get(key) ?? []), meeting]);
    });
    return grouped;
  }, [scopedMeetings]);

  const calendarDays = useMemo(() => {
    if (view === "day") return [dateFromKey(selectedDate)];
    if (view === "week") {
      const first = startOfWeek(cursor);
      return Array.from({ length: 7 }, (_, index) => addDays(first, index));
    }
    const firstOfMonth = new Date(cursor.getFullYear(), cursor.getMonth(), 1, 12);
    const firstCell = startOfWeek(firstOfMonth);
    return Array.from({ length: 42 }, (_, index) => addDays(firstCell, index));
  }, [cursor, selectedDate, view]);

  const selectedMeetings = meetingsByDate.get(selectedDate) ?? [];

  useEffect(() => {
    if (!focusMeetingId) return;
    const meeting = meetings.find((item) => item.id === focusMeetingId);
    if (!meeting) return;
    const targetKey = dateKey(meeting.start_time);
    const targetDate = dateFromKey(targetKey);
    setSelectedDate(targetKey);
    setCursor(targetDate);
  }, [focusMeetingId, meetings]);

  const navigate = (direction: -1 | 1) => {
    const next = new Date(cursor);
    if (view === "month") next.setMonth(next.getMonth() + direction, 1);
    else next.setDate(next.getDate() + direction * (view === "week" ? 7 : 1));
    setCursor(next);
    setSelectedDate(dateKey(next));
  };

  const chooseDate = (date: Date) => {
    setSelectedDate(dateKey(date));
    setCursor(date);
  };

  const resetToday = () => {
    setCursor(today);
    setSelectedDate(dateKey(today));
  };

  const changeView = (nextView: CalendarView) => {
    setView(nextView);
    setCursor(dateFromKey(selectedDate));
  };

  return <div className="calendar-page">
    <header className="calendar-page-heading">
      <div><span>Lịch làm việc ICTU</span><h1>Lịch họp của tôi</h1><p>Theo dõi lịch tổ chức, lời mời và phòng họp theo từng ngày.</p></div>
      {account.role !== "participant" && <span className="calendar-summary">{scopedMeetings.length} cuộc họp</span>}
    </header>

    <section className="calendar-shell" aria-label="Lịch họp">
      <div className="calendar-tabs" role="tablist" aria-label="Phạm vi lịch họp">
        <button className={scope === "all" ? "active" : ""} type="button" onClick={() => setScope("all")}>Lịch họp</button>
        <button className={scope === "mine" ? "active" : ""} type="button" onClick={() => setScope("mine")}>Tôi tổ chức</button>
        <button className={scope === "invited" ? "active" : ""} type="button" onClick={() => setScope("invited")}>Được mời</button>
      </div>

      <div className="calendar-toolbar">
        <div className="calendar-navigation">
          <button type="button" aria-label="Khoảng thời gian trước" onClick={() => navigate(-1)}>‹</button>
          <button type="button" onClick={resetToday}>Hôm nay</button>
          <button type="button" aria-label="Khoảng thời gian sau" onClick={() => navigate(1)}>›</button>
          <strong>{titleForRange(cursor, view)}</strong>
        </div>
        <div className="calendar-view-switch" aria-label="Chế độ xem">
          <button className={view === "month" ? "active" : ""} type="button" onClick={() => changeView("month")}>Tháng</button>
          <button className={view === "week" ? "active" : ""} type="button" onClick={() => changeView("week")}>Tuần</button>
          <button className={view === "day" ? "active" : ""} type="button" onClick={() => changeView("day")}>Ngày</button>
        </div>
      </div>

      <div className={`calendar-canvas ${view}`}>
        {view !== "day" && <div className="calendar-weekdays">{weekdays.map((day) => <span key={day}>{day}</span>)}</div>}
        <div className={`calendar-grid ${view}`}>
          {calendarDays.map((date) => {
          const key = dateKey(date);
          const dayMeetings = meetingsByDate.get(key) ?? [];
          const outsideMonth = view === "month" && date.getMonth() !== cursor.getMonth();
          const selected = key === selectedDate;
          const current = key === dateKey(today);
          const visibleEvents = dayMeetings.slice(0, view === "month" ? 2 : 5);
            return <button className={`calendar-day ${outsideMonth ? "outside" : ""} ${selected ? "selected" : ""} ${current ? "today" : ""}`} type="button" key={key} onClick={() => chooseDate(date)}>
              <span className="calendar-day-number">{date.getDate()}</span>
              <span className="calendar-events">
                {visibleEvents.map((meeting) => <span className={`calendar-event ${meeting.status}`} key={meeting.id}><b>{formatIctuTime(meeting.start_time)}</b>{meeting.title}</span>)}
                {dayMeetings.length > visibleEvents.length && <small>+{dayMeetings.length - visibleEvents.length} cuộc họp khác</small>}
              </span>
            </button>;
          })}
        </div>
      </div>
    </section>

    <section className="calendar-day-agenda" aria-labelledby="calendar-agenda-title">
      <div className="calendar-agenda-heading">
        <div><span>Lịch ngày</span><h2 id="calendar-agenda-title">{longDate(dateFromKey(selectedDate))}</h2></div>
        <strong>{selectedMeetings.length} cuộc họp</strong>
      </div>
      <MeetingList
        meetings={selectedMeetings}
        onChanged={onChanged}
        currentUserEmail={account.email}
        canManageAll={account.role === "admin"}
        focusMeetingId={focusMeetingId}
        onFocusHandled={onFocusHandled}
      />
    </section>

    {advancedContent && <details className="calendar-advanced">
      <summary>Bộ lọc nâng cao và danh sách đầy đủ</summary>
      <div>{advancedContent}</div>
    </details>}
  </div>;
}
