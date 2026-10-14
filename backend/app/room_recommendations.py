"""Deterministic room ranking for Sprint 4 US26."""

from __future__ import annotations

import math
from datetime import timedelta

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models, schemas, services


FEATURE_LABELS = {
    "projector": "máy chiếu",
    "display": "màn hình",
    "microphone": "micro",
    "video_conferencing": "họp trực tuyến",
}

EQUIPMENT_FEATURE_ALIASES = {
    "video_conference": "video_conferencing",
    "video conferencing": "video_conferencing",
    "conference_camera": "video_conferencing",
}


def _occurrences(payload: schemas.RoomRecommendationRequest):
    values = [(payload.start_time, payload.end_time)]
    start = payload.start_time
    end = payload.end_time
    start_anchor = start.day
    end_anchor = end.day
    for _ in range(1, payload.recurrence_count if payload.recurrence else 1):
        if payload.recurrence == "weekly":
            start += timedelta(weeks=1)
            end += timedelta(weeks=1)
        else:
            start = services.add_month(start, start_anchor)
            end = services.add_month(end, end_anchor)
        values.append((start, end))
    services.ensure_no_occurrence_overlaps(values)
    return values


def _validate_equipment(
    db: Session,
    equipment_ids: list[int],
    occurrences,
) -> list[models.Equipment]:
    if not equipment_ids:
        return []
    equipment = list(
        db.scalars(
            select(models.Equipment).where(models.Equipment.id.in_(equipment_ids))
        ).all()
    )
    if len(equipment) != len(set(equipment_ids)):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy một hoặc nhiều thiết bị đã chọn",
        )
    for item in equipment:
        if not item.is_active or item.status != models.EquipmentStatus.AVAILABLE:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Thiết bị {item.code} hiện không sẵn sàng",
            )
        for start_time, end_time in occurrences:
            try:
                services.ensure_equipment_available(db, item.id, start_time, end_time)
            except HTTPException as exc:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Thiết bị {item.code} đã được đặt trong một khung giờ yêu cầu",
                ) from exc
    return equipment


def recommend_rooms(
    db: Session,
    payload: schemas.RoomRecommendationRequest,
    account: models.UserAccount,
) -> schemas.RoomRecommendationPage:
    occurrences = _occurrences(payload)
    equipment = _validate_equipment(db, payload.equipment_ids, occurrences)
    candidates = services.available_rooms_for_occurrences(
        db,
        occurrences,
        payload.expected_attendees,
        account.id,
    )

    required = set(payload.required_features)
    candidates = [
        room for room in candidates
        if all(bool(getattr(room, feature)) for feature in required)
    ]

    recommendations: list[schemas.RoomRecommendationOut] = []
    preferred = (payload.preferred_building or "").strip().lower()
    equipment_categories = {
        EQUIPMENT_FEATURE_ALIASES.get(
            item.category.strip().lower(), item.category.strip().lower()
        )
        for item in equipment
    }
    for room in candidates:
        surplus = room.capacity - payload.expected_attendees
        score = max(0, 1000 - surplus * 15)
        reasons = [f"Đủ {room.capacity} chỗ cho {payload.expected_attendees} người"]

        if surplus <= max(2, math.ceil(payload.expected_attendees * 0.2)):
            score += 120
            reasons.append("Sức chứa vừa đủ, hạn chế lãng phí")
        if preferred and room.building.strip().lower() == preferred:
            score += 100
            reasons.append(f"Đúng khu vực ưu tiên {room.building}")
        if required:
            score += 40 * len(required)
            reasons.append(
                "Có sẵn " + ", ".join(FEATURE_LABELS[item] for item in sorted(required))
            )

        built_in_matches = [
            FEATURE_LABELS[category]
            for category in equipment_categories
            if category in FEATURE_LABELS and bool(getattr(room, category))
        ]
        if built_in_matches:
            score += 20 * len(built_in_matches)
            reasons.append("Phòng có sẵn " + ", ".join(sorted(built_in_matches)))
        elif equipment:
            reasons.append(f"{len(equipment)} thiết bị rời đã chọn đều còn trống")

        recommendations.append(
            schemas.RoomRecommendationOut(
                room=services.room_to_out(db, room, account.id),
                score=score,
                reasons=reasons,
                capacity_surplus=surplus,
            )
        )

    recommendations.sort(
        key=lambda item: (-item.score, item.capacity_surplus, item.room.name.lower(), item.room.id)
    )
    total = len(recommendations)
    start = (payload.page - 1) * payload.page_size
    items = recommendations[start : start + payload.page_size]
    message = None
    if not total:
        message = (
            "Không có phòng đáp ứng đồng thời thời gian, sức chứa, thiết bị và quyền đặt. "
            "Hãy đổi khung giờ, quy mô hoặc yêu cầu thiết bị."
        )
    return schemas.RoomRecommendationPage(
        items=items,
        total=total,
        page=payload.page,
        page_size=payload.page_size,
        total_pages=max(1, math.ceil(total / payload.page_size)),
        message=message,
    )
