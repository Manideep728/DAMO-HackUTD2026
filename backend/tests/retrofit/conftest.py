import os

os.environ.setdefault("RETROFIT_DB", ":memory:")
os.environ.setdefault("PREFLIGHT_DB", ":memory:")
os.environ.setdefault("PREFLIGHT_METERS", "off")

import pytest  # noqa: E402

from app.retrofit.decisions import Store  # noqa: E402
from app.retrofit.workflow import Retrofit  # noqa: E402


@pytest.fixture
def flow() -> Retrofit:
    return Retrofit(Store(":memory:"))
