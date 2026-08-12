"""PNR (trip itinerary) PDF generation — task #82. Pure rendering: takes an
already-fetched TripDetailOut (app.services.trip_service.get_trip) and lays
it out with reportlab (pure Python, no system-level dependencies — chosen
specifically over WeasyPrint/similar HTML-to-PDF renderers to avoid adding
native library requirements to an already disk-constrained build). Never
invents data: every field comes straight from the trip detail already
computed by the four planning engines — this is a presentation layer only.
"""

import io

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.schemas.trip import TripDetailOut

_NAVY = colors.HexColor("#0A0C11")
_GOLD = colors.HexColor("#C6A15B")


def _fmt_dt(iso_dt) -> str:
    return iso_dt.strftime("%d-%b-%Y %H:%MZ") if iso_dt else "—"


def _fmt_date(d) -> str:
    return d.isoformat() if d else "—"


def render_pnr_pdf(trip: TripDetailOut) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4, topMargin=18 * mm, bottomMargin=18 * mm, leftMargin=16 * mm, rightMargin=16 * mm
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("PNRTitle", parent=styles["Title"], textColor=_NAVY, spaceAfter=2)
    kicker_style = ParagraphStyle("PNRKicker", parent=styles["Normal"], textColor=_GOLD, fontSize=9, spaceAfter=8)
    h2_style = ParagraphStyle("PNRHeading2", parent=styles["Heading2"], textColor=_NAVY, spaceBefore=14, spaceAfter=6)
    body_style = styles["Normal"]

    story: list = []
    story.append(Paragraph("JETELIO", kicker_style))
    story.append(Paragraph(f"Trip Itinerary — {trip.id[:8]}", title_style))
    story.append(Paragraph(f"Status: {trip.status}  ·  Verdict: {trip.overall_verdict}", body_style))
    story.append(Spacer(1, 10 * mm))

    # Aircraft / operator summary
    aircraft_rows = [
        ["Registration", trip.aircraft_registration or "—", "Operator", trip.operator_airline_name or "—"],
        [
            "MTOW",
            f"{trip.entered_mtow_kg:,.0f} kg" if trip.entered_mtow_kg else "—",
            "Type",
            trip.legs[0].aircraft_icao_type if trip.legs else "—",
        ],
    ]
    aircraft_table = Table(aircraft_rows, colWidths=[30 * mm, 55 * mm, 30 * mm, 55 * mm])
    aircraft_table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story.append(aircraft_table)

    # Leg-by-leg summary (same shape as the OUTPUT-1 LegSummaryTable, §7.4)
    story.append(Paragraph("Legs", h2_style))
    leg_header = ["Leg", "From", "Departure", "To", "Arrival", "Call sign", "Reg.", "EET (h)", "Dist (NM)"]
    leg_rows = [leg_header]
    for i, leg in enumerate(trip.legs):
        leg_rows.append(
            [
                str(i + 1),
                leg.result.dep_icao,
                _fmt_dt(leg.reference_datetime),
                leg.result.arr_icao,
                _fmt_dt(leg.arrival_datetime),
                leg.call_sign or "—",
                leg.registration or trip.aircraft_registration or "—",
                f"{leg.result.route.eet_hours:.1f}",
                f"{leg.result.route.distance_nm:.0f}",
            ]
        )
    leg_table = Table(leg_rows, repeatRows=1)
    leg_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), _NAVY),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 7.5),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CCCCCC")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F4F4F7")]),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story.append(leg_table)

    # Permits per leg
    story.append(Paragraph("Permits &amp; deadlines", h2_style))
    permit_header = ["Leg", "Type", "Country", "File by", "Status"]
    permit_rows = [permit_header]
    for i, leg in enumerate(trip.legs):
        for p in leg.result.permits.overflight_permits:
            permit_rows.append([str(i + 1), "Overflight", p.country_name, _fmt_dt(p.deadline.file_by), p.deadline.deadline_status])
        for p in leg.result.permits.landing_permits:
            permit_rows.append([str(i + 1), "Landing", p.country_name, _fmt_dt(p.deadline.file_by), p.deadline.deadline_status])
        for g in leg.result.permits.ground_handling_orders:
            permit_rows.append([str(i + 1), "Ground handling", g.country_name, _fmt_dt(g.deadline.file_by), g.deadline.deadline_status])
    if len(permit_rows) == 1:
        story.append(Paragraph("No permits required.", body_style))
    else:
        permit_table = Table(permit_rows, repeatRows=1)
        permit_table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), _NAVY),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 7.5),
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CCCCCC")),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F4F4F7")]),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                ]
            )
        )
        story.append(permit_table)

    # Verdict reasons, per leg
    story.append(Paragraph("Verdict notes", h2_style))
    for i, leg in enumerate(trip.legs):
        for reason in leg.result.reasons:
            story.append(Paragraph(f"Leg {i + 1}: {reason}", body_style))

    story.append(Spacer(1, 10 * mm))
    story.append(
        Paragraph(
            "Advisory planning output. Verify all permit/deadline data against operator and CAA sources before dispatch.",
            ParagraphStyle("Disclaimer", parent=styles["Normal"], fontSize=7, textColor=colors.HexColor("#888888")),
        )
    )

    doc.build(story)
    return buf.getvalue()
