"""Pinned inputs, the synthetic contract and the drawing parser."""

import json
import shutil

import pytest

from app.retrofit import contract, inputs


@pytest.mark.parametrize("site", ["h1", "h2"])
def test_inputs_match_their_pins(site):
    inputs.verify_pins(site)
    s = inputs.load_site(site)
    assert s.liquid_racks() and s.cdu() and s.drawing


def test_a_changed_input_fails_the_pin(tmp_path, monkeypatch):
    shutil.copytree(inputs.SITES / "h1", tmp_path / "h1")
    monkeypatch.setattr(inputs, "SITES", tmp_path)
    inputs.verify_pins("h1")
    (tmp_path / "h1" / "rack_drawing.txt").write_text("redrawn")
    with pytest.raises(inputs.PinMismatch, match="rack_drawing.txt"):
        inputs.verify_pins("h1")


def test_unknown_or_unsafe_site_ids_are_rejected():
    for bad in ("h9", "../h1", "h1/.."):
        with pytest.raises(KeyError):
            inputs.site_dir(bad)


def test_drawing_quotes_are_verbatim_sentences():
    s = inputs.load_site("h1")
    assert {n.zone: n.location for n in s.drawing} == {1: "CDU-1", 2: "R3-01", 3: "R3-02"}
    assert all(n.quote in s.drawing_text for n in s.drawing)


def test_contract_file_matches_the_code_and_says_synthetic():
    on_disk = json.loads(contract.path().read_text())
    assert on_disk == json.loads(json.dumps(contract.schema(), sort_keys=True))
    assert on_disk["synthetic"] is True and "Not NVIDIA DSX" in on_disk["title"]


def test_firmware_change_is_visible_in_the_point_lists():
    s = inputs.load_site("h1")
    old, new = s.vendor_points["2.3.0"], s.vendor_points["2.4.0"]
    assert old["run_state"].enum[2] == "standby" and new["run_state"].enum[2] == "running_degraded"
    assert "leak_zone_2" in old and "leak_detect_z2" in new
    assert old["leak_zone_2"].register == new["leak_detect_z2"].register
