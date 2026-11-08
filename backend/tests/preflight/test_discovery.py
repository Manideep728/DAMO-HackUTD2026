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
    assert group.live_suppliers() == ["ATS-1"]
    edge = next(s for s in group.suppliers if s.supplier == "ATS-1")
    assert edge.source.value == "engineer_confirmed" and edge.citations
    assert [c.nodes for c in find_cut_sets(after, max_order=1).cut_sets] == [["ATS-1"]]
    # The documented feed is remembered, and switching back to it removes the single point.
    assert after.restorable() == [("MCC-B", "power", "ATS-1", "ATS-2")]
    assert find_cut_sets(after.with_restored("MCC-B"), max_order=1).cut_sets == []


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
    assert s["recall"] >= 0.85  # digit-swap typos that hit another real tag stay missed; pins the current level


def test_fuzzy_match_fixes_letter_typos_but_never_changes_the_suffix():
    r = Resolver(demo_facility())
    found = {m.surface: (m.node, m.how) for m in r.mentions("pmup mcc b fed from trnasfer sw 1; pump c; PUMP-C")}
    assert found["pmup mcc b"] == ("MCC-B", "fuzzy")
    assert found["trnasfer sw 1"] == ("ATS-1", "fuzzy")
    assert "pump c" not in found and found["PUMP-C"] == (None, "alias")  # PUMP-C is not installed


def _doc(text: str):
    from app.preflight.discovery import Doc

    return Doc("WO-T1", "work_order", "2024-05-01", "test", text)


def test_model_fallback_resolves_a_leftover_phrase_and_keeps_the_quote_verbatim():
    phrase_seen = []

    def model(phrase, sentence):
        phrase_seen.append(phrase)
        return "MCC-B"

    doc = _doc("Electrician found the B side pump panel fed from ATS-1.")
    res = discover(demo_facility(), [doc], model=model, with_impact=False)
    claim = next(c for c in res.claims if c.supplier == "ATS-1")
    assert claim.consumer == "MCC-B" and claim.extractor == "nemotron-resolve"
    assert claim.quote in doc.text and phrase_seen == ["the B side pump panel"]


@pytest.mark.parametrize("answer", ["ATS-2", "NOT-A-NODE", None])
def test_model_answers_without_the_nodes_suffix_or_outside_the_inventory_are_dropped(answer):
    res = discover(
        demo_facility(),
        [_doc("Electrician found the B side pump panel fed from ATS-1.")],
        model=lambda phrase, sentence: answer,
        with_impact=False,
    )
    assert [c for c in res.claims if c.supplier == "ATS-1"] == []


def test_demo_findings_are_identical_whatever_the_model_answers():
    import random

    docs, labels = load_corpus()
    ids = [n.id for n in demo_facility().nodes] + ["NOT-A-NODE", None]
    baseline = discover(demo_facility(), docs)
    key = lambda r: [(f.id, f.classification, f.confidence, f.status) for f in r.findings]
    for seed in range(10):
        rnd = random.Random(seed)
        r = discover(demo_facility(), docs, model=lambda p, s, rnd=rnd: rnd.choice(ids))
        assert key(r) == key(baseline)
        s = score(r, labels)
        assert s["precision"] == 1.0 and s["recall"] == 1.0
        f = next(x for x in r.findings if x.consumer == "MCC-B" and x.supplier == "ATS-1")
        assert f.classification == "contradicts" and f.impact["new_single_points"] == ["ATS-1"]


# ------------------------------------------------------------------ Nemotron reading the records


def _reader(answers: dict[str, list[dict]]):
    """A fake model that answers per record id, read from the prompt."""
    import json
    import re

    def model(prompt: str) -> str:
        doc_id = re.search(r"^Record (\S+) \(", prompt, re.M).group(1)
        return json.dumps({"feeds": answers.get(doc_id, [])})

    return model


def test_model_read_keeps_checked_claims_and_says_why_it_drops_the_rest():
    from app.preflight.extract_model import read_records

    docs, _ = load_corpus()
    feed = lambda c, s, q, st="current": {"consumer": c, "supplier": s, "quote": q, "status": st}
    read = read_records(
        demo_facility(),
        docs,
        _reader(
            {
                "WO-4471": [
                    feed("MCC-B", "ATS-1", "pump mcc b still back-fed from transfer sw 1"),  # kept
                    feed("MCC-B", "ATS-1", "pump MCC-B is back-fed from ATS-1"),  # paraphrase
                    feed("MCC-A", "ATS-1", "pump mcc b still back-fed from transfer sw 1"),  # wrong pair
                    feed("PUMP-C", "ATS-1", "pump mcc b still back-fed from transfer sw 1"),  # not installed
                ],
                # The model calls it current; the next sentence says the cable was removed.
                "WO-3920": [feed("MCC-B", "ATS-1", "MCC-B was briefly powered from ATS-1 on a temporary cable")],
                "WO-5230": [feed("CRAH-3", "SWGR-A", "CRAH-3 is fed from swgr A", "proposed")],
            }
        ),
    )
    s = read.stats
    assert (s["proposed"], s["kept"], s["set_aside"]) == (6, 1, 2)
    assert s["rejected"] == {"unknown_node": 1, "not_verbatim": 1, "wrong_pair": 1}
    kept = [c for c in read.claims if c.current]
    assert [(c.consumer, c.supplier, c.doc_id, c.extractor) for c in kept] == [
        ("MCC-B", "ATS-1", "WO-4471", "nemotron-read")
    ]
    aside = {c.doc_id: c.reason for c in read.claims if not c.current}
    assert aside == {
        "WO-3920": "temporary connection that was later removed",
        "WO-5230": "Nemotron read it as proposed",
    }


def test_a_record_read_by_rules_and_model_counts_once():
    from app.preflight.extract_model import read_records

    docs, _ = load_corpus()
    read = read_records(
        demo_facility(),
        docs,
        _reader(
            {
                "WO-4471": [
                    {"consumer": "MCC-B", "supplier": "ATS-1", "quote": "pump mcc b still back-fed from transfer sw 1"}
                ]
            }
        ),
    )
    base = discover(demo_facility(), docs, with_impact=False)
    both = discover(demo_facility(), docs, extra_claims=read.claims, with_impact=False)
    f0 = next(f for f in base.findings if f.id == "F-MCC-B-ATS-1")
    f1 = next(f for f in both.findings if f.id == "F-MCC-B-ATS-1")
    assert f1.confidence == f0.confidence
    assert len(f1.supporting) == len(f0.supporting)
    wo = next(c for c in f1.supporting if c["doc_id"] == "WO-4471")
    assert wo["extractor"] == "rules+nemotron-read"


def test_no_model_answer_at_all_is_reported_as_unavailable():
    from app.preflight.extract_model import ModelUnavailable, read_records

    with pytest.raises(ModelUnavailable):
        read_records(demo_facility(), load_corpus()[0], lambda prompt: None)


def test_demo_findings_survive_a_model_that_pins_real_sentences_on_random_pairs():
    import random

    from app.preflight.discovery import chunks
    from app.preflight.extract_model import read_records

    docs, labels = load_corpus()
    ids = [n.id for n in demo_facility().nodes]
    baseline = discover(demo_facility(), docs)
    key = lambda r: [(f.id, f.classification, f.confidence, f.status) for f in r.findings]
    for seed in range(10):
        rnd = random.Random(seed)
        answers = {
            d.id: [
                {
                    "consumer": rnd.choice(ids),
                    "supplier": rnd.choice(ids),
                    "quote": s,
                    "status": rnd.choice(["current", "temporary", "proposed"]),
                }
                for _, s in chunks(d)
            ]
            for d in docs
        }
        read = read_records(demo_facility(), docs, _reader(answers))
        r = discover(demo_facility(), docs, extra_claims=read.claims, extra_rejected=read.rejected)
        assert key(r) == key(baseline), seed
        assert score(r, labels)["precision"] == 1.0


def test_the_model_reads_a_name_the_rules_cannot_place():
    from app.preflight.extract_model import read_records

    doc = _doc("Electrician found the B side pump panel fed from ATS-1.")
    assert discover(demo_facility(), [doc], with_impact=False).claims == []  # the rules alone find nothing
    read = read_records(
        demo_facility(),
        [doc],
        _reader(
            {"WO-T1": [{"consumer": "MCC-B", "supplier": "ATS-1", "quote": "the B side pump panel fed from ATS-1"}]}
        ),
    )
    assert read.stats["kept"] == 1
    r = discover(demo_facility(), [doc], extra_claims=read.claims, with_impact=False)
    assert [(f.consumer, f.supplier, f.classification) for f in r.findings] == [("MCC-B", "ATS-1", "contradicts")]


def test_a_set_aside_record_read_by_rules_and_model_is_listed_once():
    from app.preflight.extract_model import read_records

    docs, _ = load_corpus()
    quote = "MCC-B was briefly powered from ATS-1 on a temporary cable"
    read = read_records(
        demo_facility(), docs, _reader({"WO-3920": [{"consumer": "MCC-B", "supplier": "ATS-1", "quote": quote}]})
    )
    r = discover(demo_facility(), docs, extra_claims=read.claims, with_impact=False)
    f = next(f for f in r.findings if f.id == "F-MCC-B-ATS-1")
    assert [(a["doc_id"], a["extractor"]) for a in f.set_aside] == [("WO-3920", "rules+nemotron-read")]
    assert [x.doc_id for x in r.rejected].count("WO-3920") == 1
