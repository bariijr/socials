import enum

from sqlalchemy import ARRAY, Boolean, Enum, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import StandardMixin


class MessagingChannel(str, enum.Enum):
    EMAIL = "EMAIL"
    SITA = "SITA"
    AFTN = "AFTN"
    FAX = "FAX"
    PORTAL = "PORTAL"


class MessageFormat(str, enum.Enum):
    PLAIN_TEXT_UPPERCASE = "PLAIN_TEXT_UPPERCASE"
    PLAIN_TEXT = "PLAIN_TEXT"
    HTML = "HTML"


# The messaging-preference shape (preferred_channel, messaging_to,
# messaging_cc, sita_address, aftn_address, message_format,
# sending_team_signature) is identical on every counterparty — operator,
# client, vendor — per the messaging spec. Declared as concrete columns on
# each of those models rather than a shared mixin (SQLAlchemy Enum columns
# need distinct per-table names), see operator.py / client.py / vendor.py.


class MessageTemplate(Base, StandardMixin):
    """Versioned DB row, never hand-typed. Rendered with Jinja2
    (autoescape off — these are plain-text teletype messages).
    """

    __tablename__ = "message_templates"

    template_key: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(300), nullable=False)
    message_type: Mapped[str] = mapped_column(String(100), nullable=False)
    recipient_role: Mapped[str] = mapped_column(String(100), nullable=False)
    channel: Mapped[MessagingChannel] = mapped_column(
        Enum(MessagingChannel, name="message_template_channel"), nullable=False
    )
    subject_line: Mapped[str | None] = mapped_column(String(500), nullable=True)
    body: Mapped[str] = mapped_column(String, nullable=False)
    footer_block: Mapped[str | None] = mapped_column(String, nullable=True)
    required_attachments: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    template_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
