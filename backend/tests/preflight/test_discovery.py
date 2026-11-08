import pytest

from app.preflight.data.demo import demo_facility
from app.preflight.data.generator import generate_facility
from app.preflight.data.noisy_corpus import noisy_corpus
from app.preflight.discovery import Claim, Resolver, apply_finding, discover, load_corpus, score
from engine.cutsets import find_cut_sets


@pytest.fixture(scope="module")
def result():
    docs, _ = load_corpus()
    return discover(demo_facility(), docs)


def test_resolver_handles_aliases_typos_and_unknown_tags():
    r = Resolver(demo_facility())
    found = [(m.surface, m.node) for m in r.mentions("found pump mcc b back-fed from transfer sw 1, ATS1 and PUMP-C")]
    assert ("pump mcc b", "MCC-B") in found and ("transfer sw 1", "ATS-1") in found
    assert ("ATS1", "ATS-1") in found and ("PUMP-C", None) in found


def test_hidden_pump_dependency_is_found_and_contradicts_the_one_line(result):
    f = next(x for x in result.findings if x.consumer == "MCC-B" and x.supplier == "ATS-1")
    assert f.classification == "contradicts" and f.replaces == "ATS-2"
    assert {s["doc_id"] for s in f.supporting} >= {"WO-4471", "MLOG-0212"}
    assert [c["doc_id"] for c in f.contradicting] == ["OLD-001"]
    assert f.confidence >= 0.9
    assert f.impact["new_single_points"] == ["ATS-1"]
    stale = next(x for x in result.findings if x.consumer == "MCC-B" and x.supplier == "ATS-2")
    assert stale.status == "superseded"


def test_every_citation_is_verbatim(result):
    docs = {d.id: d.text for d in load_corpus()[0]}
    for f in result.findings:
        for c in f.supporting + f.contradicting:
            assert c["quote"] in docs[c["doc_id"]]


def test_red_herrings_are_rejected_with_reasons(result):
    reasons = {r.doc_id: r.reason for r in result.rejected}
    assert "removed" in reasons["WO-3920"]
    assert "PUMP-C" in reasons["WO-5108"]
    assert all(f.consumer != "PUMP-C" for f in result.findings)
    temp = next(x for x in result.findings if x.consumer == "MCC-B" and x.supplier == "ATS-1")
    assert [a["doc_id"] for a in temp.set_aside] == ["WO-3920"]


def test_hallucinated_quotes_are_rejected():
    docs, _ = load_corpus()
    fake = Claim("CH-1", "UPS-A", "WO-4471", "2023-09-08", "work_order", "Chiller 1 is fed from UPS-A", extractor="llm")
    real = Claim(
        "MCC-B",
        "ATS-1",
        "WO-4471",
        "2023-09-08",
        "work_order",
        "pump mcc b still back-fed from transfer sw 1",
        extractor="llm",
    )
    res = discover(demo_facility(), docs, extra_claims=[fake, real], with_impact=False)
    assert any(r.reason.startswith("quote not found") and r.quote == fake.quote for r in res.rejected)
    assert all(not (f.consumer == "CH-1" and f.supplier == "UPS-A") for f in res.findings)


def test_confirming_the_finding_changes_the_risk_picture(result):
    f = next(x for x in result.findings if x.classification == "contradicts")
    after = apply_finding(demo_facility(), f)
    group = next(g for g in after.by_id()["MCC-B"].requires if g.name == "power")
    edge = group.suppliers[0]
    assert edge.supplier == "ATS-1" and edge.source.value == "engineer_confirmed" and edge.citations
    assert [c.nodes for c in find_cut_sets(after, max_order=1).cut_sets] == [["ATS-1"]]


def test_precision_and_recall_on_the_demo_corpus(result):
    _, labels = load_corpus()
    s = score(result, labels)
    assert s["precision"] == 1.0 and s["recall"] == 1.0


@pytest.mark.parametrize("seed", range(3))
def test_precision_and_recall_on_noisy_generated_records(seed):
    f = generate_facility(seed)
    docs, labels = noisy_corpus(f, seed)
    s = score(discover(f, docs, with_impact=False), labels)
    assert s["precision"] >= 0.95  # herrings must not get through
    assert s["recall"] >= 0.75  # typos cost some recall; this pins the current level
