"""The frontend's offline snapshot must be exactly what the backend produces today."""

import json

from app.retrofit import export


def test_committed_snapshot_matches_the_code():
    committed = json.loads(export.TARGET.read_text())
    assert committed == json.loads(json.dumps(export.build(), sort_keys=True)), (
        "frontend/src/retrofit/snapshot.json is stale: run python -m app.retrofit.export"
    )
