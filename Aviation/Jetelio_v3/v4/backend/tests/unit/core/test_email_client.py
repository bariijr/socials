import uuid

from app.core.email_client import build_reference_tag, parse_reference_tag


class TestReferenceTag:
    def test_round_trips(self):
        trip_id = str(uuid.uuid4())
        leg_id = str(uuid.uuid4())
        tag = build_reference_tag(trip_id, leg_id, "GH", "KJFK")
        assert parse_reference_tag(f"Re: Ground handling request {tag}") == (trip_id, leg_id, "GH", "KJFK")

    def test_survives_a_typical_reply_prefix_and_surrounding_text(self):
        trip_id = str(uuid.uuid4())
        leg_id = str(uuid.uuid4())
        tag = build_reference_tag(trip_id, leg_id, "FUL", "OMDB")
        subject = f"RE: RE: Fwd: Overflight permit — {tag} — please advise"
        assert parse_reference_tag(subject) == (trip_id, leg_id, "FUL", "OMDB")

    def test_no_tag_returns_none(self):
        assert parse_reference_tag("Out of office reply") is None

    def test_malformed_tag_returns_none(self):
        assert parse_reference_tag("[JTL-not-a-real-uuid-GH-KJFK]") is None
