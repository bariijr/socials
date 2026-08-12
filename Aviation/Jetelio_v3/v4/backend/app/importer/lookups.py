"""Cross-sheet lookups and small enum-mapping helpers used by every loader.
Built once countries/operators/vendors are loaded so later sheets can
resolve a workbook business id (e.g. 'OPV-04') or a display name
(e.g. 'Oman') to the row actually created in this run.
"""

from app.models.messaging import MessageFormat, MessagingChannel


class CountryIndex:
    def __init__(self) -> None:
        self.by_iso3: dict[str, str] = {}
        self.by_iso2: dict[str, str] = {}
        self.by_name: dict[str, str] = {}

    def add(self, iso3: str, iso2: str | None, name: str) -> None:
        self.by_iso3[iso3.upper()] = iso3.upper()
        if iso2:
            self.by_iso2[iso2.upper()] = iso3.upper()
        self.by_name[name.strip().upper()] = iso3.upper()

    def resolve_name(self, name: str | None) -> str | None:
        if not name:
            return None
        return self.by_name.get(name.strip().upper())

    def resolve_iso2(self, iso2: str | None) -> str | None:
        if not iso2:
            return None
        return self.by_iso2.get(iso2.strip().upper())


class RefIndex:
    """Maps a workbook source_ref (e.g. 'OPV-04', 'VND-001') to the UUID
    primary key assigned when the row was inserted in this run.
    """

    def __init__(self) -> None:
        self._map: dict[str, object] = {}

    def add(self, source_ref: str, pk) -> None:
        self._map[source_ref.strip().upper()] = pk

    def resolve(self, source_ref: str | None):
        if not source_ref:
            return None
        return self._map.get(source_ref.strip().upper())


def map_messaging_channel(value: str | None) -> MessagingChannel | None:
    if not value:
        return None
    v = value.strip().upper()
    if v.startswith("EMAIL"):
        return MessagingChannel.EMAIL
    if v.startswith("SITA"):
        return MessagingChannel.SITA
    if v.startswith("AFTN"):
        return MessagingChannel.AFTN
    if v.startswith("FAX"):
        return MessagingChannel.FAX
    if v.startswith("PORTAL"):
        return MessagingChannel.PORTAL
    return None


def map_message_format(value: str | None) -> MessageFormat | None:
    if not value:
        return None
    v = value.strip().upper().replace(" ", "_")
    try:
        return MessageFormat(v)
    except ValueError:
        return None
