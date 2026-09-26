"""merge email opt-in and recovery data source heads

Revision ID: c4d2f1a8e903
Revises: 3a54c862ee52, 9b3c1d2e4f50
Create Date: 2026-09-27 04:30:00.000000

Both branches descend from 7e91a2c4b5d6 and touch unrelated tables, so the
merge itself changes nothing.
"""
from typing import Sequence, Union

revision: str = "c4d2f1a8e903"
down_revision: Union[str, Sequence[str], None] = ("3a54c862ee52", "9b3c1d2e4f50")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
