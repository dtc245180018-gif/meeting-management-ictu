from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from . import models, schemas


ICTU_TIMEZONE = "Asia/Ho_Chi_Minh"


def _duration_minutes(start: datetime, end: datetime) -> int:
    return max(0, int((end - start).total_seconds() // 60))


def report_overview(
    db: Session,
    *,
    date_from: datetime,
    date_to: datetime,
    room_id: int | None = None,
    floor: int | None = None,
    building: str | None = None,
) -> schemas.ReportOverviewOut:
    if date_to < date_from:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Khoảng báo cáo không hợp lệ")

    stmt = (
        select(models.Meeting)
        .options(
            selectinload(models.Meeting.booking).selectinload(models.RoomBooking.room),
            selectinload(models.Meeting.participants),
        )
        .where(models.Meeting.start_time >= date_from, models.Meeting.start_time <= date_to)
        .order_by(models.Meeting.start_time)
    )
    meetings = list(db.scalars(stmt).all())

    normalized_building = building.strip().lower() if building else None
    if room_id is not None or floor is not None or normalized_building:
        meetings = [
            meeting
            for meeting in meetings
            if meeting.booking
            and (room_id is None or meeting.booking.room_id == room_id)
            and (floor is None or meeting.booking.room.floor == floor)
            and (
                normalized_building is None
                or meeting.booking.room.building.strip().lower() == normalized_building
            )
        ]

    now = datetime.now(timezone.utc)
    total = len(meetings)
    cancelled = sum(item.status == models.MeetingStatus.CANCELLED for item in meetings)
    scheduled = sum(
        item.status == models.MeetingStatus.SCHEDULED and item.end_time >= now
        for item in meetings
    )
    completed = sum(
        item.status == models.MeetingStatus.SCHEDULED and item.end_time < now
        for item in meetings
    )
    bookings = [item.booking for item in meetings if item.booking is not None]

    room_buckets: dict[int, dict] = {}
    for meeting in meetings:
        if meeting.booking is None:
            continue
        room = meeting.booking.room
        bucket = room_buckets.setdefault(
            room.id,
            {
                "room_id": room.id,
                "room_name": room.name,
                "building": room.building,
                "floor": room.floor,
                "booking_count": 0,
                "booked_minutes": 0,
                "scheduled_count": 0,
                "completed_count": 0,
                "cancelled_count": 0,
            },
        )
        bucket["booking_count"] += 1
        bucket["booked_minutes"] += _duration_minutes(meeting.start_time, meeting.end_time)
        if meeting.status == models.MeetingStatus.CANCELLED:
            bucket["cancelled_count"] += 1
        elif meeting.end_time < now:
            bucket["completed_count"] += 1
        else:
            bucket["scheduled_count"] += 1

    room_usage = [schemas.RoomUsageRow(**value) for value in room_buckets.values()]
    room_usage.sort(key=lambda row: (-row.booking_count, -row.booked_minutes, row.room_name))

    daily: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    reasons: Counter[str] = Counter()
    organizers: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    for meeting in meetings:
        day = meeting.start_time.astimezone(ZoneInfo(ICTU_TIMEZONE)).date().isoformat()
        daily[day][0] += 1
        organizers[meeting.organizer_email][0] += 1
        if meeting.status == models.MeetingStatus.CANCELLED:
            daily[day][1] += 1
            organizers[meeting.organizer_email][1] += 1
            reasons[(meeting.cancellation_reason or "Không ghi lý do").strip() or "Không ghi lý do"] += 1

    trend = [
        schemas.CancellationTrendRow(
            date=day,
            total_count=counts[0],
            cancelled_count=counts[1],
            cancellation_rate=round(counts[1] * 100 / counts[0], 2) if counts[0] else 0,
        )
        for day, counts in sorted(daily.items())
    ]
    organizer_rows = [
        schemas.OrganizerCancellationRow(
            organizer_email=email,
            total_count=counts[0],
            cancelled_count=counts[1],
            cancellation_rate=round(counts[1] * 100 / counts[0], 2) if counts[0] else 0,
        )
        for email, counts in sorted(organizers.items(), key=lambda item: (-item[1][1], item[0]))
    ]

    return schemas.ReportOverviewOut(
        generated_at=now,
        date_from=date_from,
        date_to=date_to,
        summary=schemas.ReportSummary(
            total_meetings=total,
            scheduled_meetings=scheduled,
            completed_meetings=completed,
            cancelled_meetings=cancelled,
            cancellation_rate=round(cancelled * 100 / total, 2) if total else 0,
            total_bookings=len(bookings),
            total_booking_minutes=sum(
                _duration_minutes(item.start_time, item.end_time) for item in bookings
            ),
        ),
        room_usage=room_usage,
        cancellation_trend=trend,
        cancellation_reasons=[
            schemas.CancellationReasonRow(reason=reason, count=count)
            for reason, count in reasons.most_common()
        ],
        organizer_cancellations=organizer_rows,
        top_room=room_usage[0] if room_usage else None,
    )


def export_excel(report: schemas.ReportOverviewOut) -> bytes:
    workbook = Workbook()
    summary_sheet = workbook.active
    summary_sheet.title = "Tổng quan"
    title = "BÁO CÁO SỬ DỤNG PHÒNG HỌP ICTU"
    summary_sheet.append([title])
    summary_sheet.append(["Khoảng thời gian", report.date_from.isoformat(), report.date_to.isoformat()])
    summary_sheet.append(["Múi giờ", report.timezone])
    summary_sheet.append([])
    summary_sheet.append(["Chỉ số", "Giá trị"])
    metrics = [
        ("Tổng cuộc họp", report.summary.total_meetings),
        ("Đang/sắp diễn ra", report.summary.scheduled_meetings),
        ("Đã hoàn thành", report.summary.completed_meetings),
        ("Đã hủy", report.summary.cancelled_meetings),
        ("Tỷ lệ hủy (%)", report.summary.cancellation_rate),
        ("Lượt đặt phòng", report.summary.total_bookings),
        ("Tổng phút sử dụng", report.summary.total_booking_minutes),
    ]
    for row in metrics:
        summary_sheet.append(row)

    room_sheet = workbook.create_sheet("Sử dụng phòng")
    room_sheet.append(["Phòng", "Khu", "Tầng", "Lượt đặt", "Số phút", "Sắp tới", "Hoàn thành", "Đã hủy"])
    for row in report.room_usage:
        room_sheet.append([
            row.room_name, row.building, row.floor, row.booking_count, row.booked_minutes,
            row.scheduled_count, row.completed_count, row.cancelled_count,
        ])

    cancel_sheet = workbook.create_sheet("Thống kê hủy")
    cancel_sheet.append(["Ngày", "Tổng cuộc họp", "Đã hủy", "Tỷ lệ hủy (%)"])
    for row in report.cancellation_trend:
        cancel_sheet.append([row.date, row.total_count, row.cancelled_count, row.cancellation_rate])
    cancel_sheet.append([])
    cancel_sheet.append(["Lý do", "Số lần"])
    for row in report.cancellation_reasons:
        cancel_sheet.append([row.reason, row.count])
    cancel_sheet.append([])
    cancel_sheet.append(["Người tổ chức", "Tổng cuộc họp", "Đã hủy", "Tỷ lệ hủy (%)"])
    for row in report.organizer_cancellations:
        cancel_sheet.append([
            row.organizer_email,
            row.total_count,
            row.cancelled_count,
            row.cancellation_rate,
        ])

    header_fill = PatternFill("solid", fgColor="00529B")
    for sheet in workbook.worksheets:
        sheet.freeze_panes = "A2"
        for cell in sheet[1]:
            cell.font = Font(bold=True, color="FFFFFF")
            cell.fill = header_fill
            cell.alignment = Alignment(horizontal="center")
        for column in sheet.columns:
            width = min(45, max(12, max(len(str(cell.value or "")) for cell in column) + 2))
            sheet.column_dimensions[column[0].column_letter].width = width

    output = BytesIO()
    workbook.save(output)
    return output.getvalue()


def _pdf_font() -> str:
    candidates = [
        Path("C:/Windows/Fonts/arial.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            if "ICTUUnicode" not in pdfmetrics.getRegisteredFontNames():
                pdfmetrics.registerFont(TTFont("ICTUUnicode", str(candidate)))
            return "ICTUUnicode"
    return "Helvetica"


def export_pdf(report: schemas.ReportOverviewOut) -> bytes:
    output = BytesIO()
    font = _pdf_font()
    document = SimpleDocTemplate(
        output,
        pagesize=landscape(A4),
        rightMargin=12 * mm,
        leftMargin=12 * mm,
        topMargin=12 * mm,
        bottomMargin=12 * mm,
        title="Báo cáo sử dụng phòng họp ICTU",
    )
    styles = getSampleStyleSheet()
    styles["Title"].fontName = font
    styles["Normal"].fontName = font
    styles["Heading2"].fontName = font
    story = [
        Paragraph("BÁO CÁO SỬ DỤNG PHÒNG HỌP ICTU", styles["Title"]),
        Paragraph(
            f"Thời gian: {report.date_from.isoformat()} — {report.date_to.isoformat()} · Múi giờ: {report.timezone}",
            styles["Normal"],
        ),
        Spacer(1, 5 * mm),
    ]
    summary_data = [
        ["Tổng cuộc họp", "Sắp tới", "Hoàn thành", "Đã hủy", "Tỷ lệ hủy", "Lượt đặt", "Số phút"],
        [
            report.summary.total_meetings,
            report.summary.scheduled_meetings,
            report.summary.completed_meetings,
            report.summary.cancelled_meetings,
            f"{report.summary.cancellation_rate}%",
            report.summary.total_bookings,
            report.summary.total_booking_minutes,
        ],
    ]
    room_data = [["Phòng", "Khu", "Tầng", "Lượt đặt", "Số phút", "Sắp tới", "Hoàn thành", "Đã hủy"]]
    room_data.extend([
        [row.room_name, row.building, row.floor, row.booking_count, row.booked_minutes, row.scheduled_count, row.completed_count, row.cancelled_count]
        for row in report.room_usage
    ])
    if len(room_data) == 1:
        room_data.append(["Không có dữ liệu", "", "", "", "", "", "", ""])
    trend_data = [["Ngày", "Tổng cuộc họp", "Đã hủy", "Tỷ lệ hủy"]]
    trend_data.extend([
        [row.date, row.total_count, row.cancelled_count, f"{row.cancellation_rate}%"]
        for row in report.cancellation_trend
    ])
    reason_data = [["Lý do hủy", "Số lần"]]
    reason_data.extend([[row.reason, row.count] for row in report.cancellation_reasons])
    organizer_data = [["Người tổ chức", "Tổng cuộc họp", "Đã hủy", "Tỷ lệ hủy"]]
    organizer_data.extend([
        [row.organizer_email, row.total_count, row.cancelled_count, f"{row.cancellation_rate}%"]
        for row in report.organizer_cancellations
    ])

    sections = [
        ("Tổng quan", summary_data),
        ("Sử dụng phòng", room_data),
        ("Xu hướng hủy theo ngày", trend_data),
        ("Lý do hủy", reason_data),
        ("Hủy theo người tổ chức", organizer_data),
    ]
    for heading, data in sections:
        story.append(Paragraph(heading, styles["Heading2"]))
        table = Table(data, repeatRows=1)
        table.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (-1, -1), font),
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#00529B")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#B7C9DD")),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F2F7FC")]),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ]))
        story.extend([table, Spacer(1, 5 * mm)])

    document.build(story)
    return output.getvalue()
