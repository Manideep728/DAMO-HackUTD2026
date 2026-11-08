"""Maintenance planning: search windows, evaluate each with the simulator and cut sets, try mitigations.

Plans are ranked lexicographically, best first:
1. no critical service lost at any hour of the window
2. no load lost at all (shed racks count)
3. the smallest cut-set order during the window (higher is safer; a 1 is a single point of failure)
4. the lowest headroom during the window, capped at 20% (above that, more headroom is not a reason to pick)
5. fewer single points of failure, then fewer mitigations, then the earliest start
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from itertools import combinations

from .cutsets import find_cut_sets
from .model import Facility, Mode, NodeType, RequirementGroup, Resource, State, Supply
from .timestep import Profiles, Window, scale_at, snapshot, states_at

SHED = "shed_flexible_load"
COMFORTABLE = 0.20
TEMP_COOLING = "temporary_cooling"


@dataclass
class Task:
    name: str
    nodes: list[str]
    duration_h: int
    earliest: int
    latest: int  # the window must end by this hour


@dataclass
class Plan:
    task: Task
    start: int
    mitigations: list[str] = field(default_factory=list)

    @property
    def end(self) -> int:
        return self.start + self.task.duration_h


@dataclass
class Evaluation:
    start: int
    end: int
    mitigations: list[str]
    lost_services: list[str]
    first_loss_hour: int | None
    lost_load: list[str]
    lost_kw: float
    min_cut_order: int
    single_points: list[str]
    min_margin: float
    tightest: str | None
    tightest_hour: int | None
    score: tuple
    reasons: list[str] = field(default_factory=list)


@dataclass
class PlanSearch:
    task: Task
    top: list[Evaluation]
    rejected: list[Evaluation]
    evaluated: int


def _with_temp_cooling(facility: Facility, zones: Iterable[str], kw: float) -> Facility:
    """Copy with one temporary cooling unit per zone added as a supplier to every rack's cooling group there."""
    f = facility.model_copy(deep=True)
    zones = set(zones)
    for z in sorted(zones):
        f.nodes.append(
            f.nodes[0].model_copy(
                update={
                    "id": f"temp-cooling-{z}",
                    "type": NodeType.crah,
                    "label": f"Temporary cooling ({z})",
                    "zone": z,
                    "capacity": kw,
                    "base_load": 0.0,
                    "heat_load": 0.0,
                    "criticality": 0,
                    "failure_rate": 0.0,
                    "flexible_kw": 0.0,
                    "metadata": {"temporary": True},
                    "provenance": "mitigation",
                    "requires": [],
                }
            )
        )
    for n in f.nodes:
        if n.type == NodeType.rack and n.zone in zones:
            groups = [g for g in n.requires if g.resource == Resource.cooling and g.mode == Mode.capacity]
            if groups:
                groups[0].suppliers.append(Supply(supplier=f"temp-cooling-{n.zone}"))
            else:
                n.requires.append(
                    RequirementGroup(
                        name="cooling",
                        resource=Resource.cooling,
                        mode=Mode.capacity,
                        suppliers=[Supply(supplier=f"temp-cooling-{n.zone}")],
                    )
                )
    return Facility.model_validate(f.model_dump())


def _shed_scale(facility: Facility, scale: dict[str, float]) -> dict[str, float]:
    out = dict(scale)
    for n in facility.nodes:
        if n.flexible_kw > 0 and n.base_load > 0:
            out[n.id] = out.get(n.id, 1.0) * max(0.0, (n.base_load - n.flexible_kw) / n.base_load)
    return out


def evaluate_plan(
    facility: Facility,
    plan: Plan,
    profiles: Profiles | None = None,
    windows: Iterable[Window] = (),
    base_states: Mapping[str, State] | None = None,
    max_order: int = 2,
    temp_cooling_kw: float = 100.0,
    _cut_cache: dict | None = None,
) -> Evaluation:
    windows = list(windows)
    mitig = list(plan.mitigations)
    overlapping = [w for w in windows if w.start < plan.end and plan.start < w.end]
    postponed = {w.label for w in overlapping if f"postpone:{w.label}" in mitig}
    active_windows = [w for w in windows if w.label not in postponed]
    fac = facility
    if TEMP_COOLING in mitig:
        zones = {facility.by_id()[n].zone for n in plan.task.nodes}
        fac = _with_temp_cooling(facility, zones or {n.zone for n in facility.nodes}, temp_cooling_kw)
    services = fac.critical_services()
    task_window = Window(plan.task.nodes, plan.start, plan.end, plan.task.name)

    lost: list[str] = []
    lost_any: list[str] = []
    first_loss = None
    by_id = fac.by_id()
    worst: tuple[float, str | None, int | None] = (1.0, None, None)
    peak = None
    for h in range(plan.start, plan.end):
        states = states_at(base_states, [*active_windows, task_window], h)
        scale = scale_at(fac, profiles, h)
        if SHED in mitig:
            scale = _shed_scale(fac, scale)
        snap = snapshot(fac, h, states, scale, services)
        if snap.lost_services and first_loss is None:
            first_loss = h
        lost += [s for s in snap.lost_services if s not in lost]
        lost_any += [s for s in snap.lost if s not in lost_any]
        if snap.min_margin < worst[0]:
            worst = (snap.min_margin, snap.tightest, h)
        total = sum(scale.values()) if scale else 0.0
        key = (tuple(sorted((k, v.value) for k, v in states.items())), round(total, 1))
        if peak is None or total > peak[0]:
            peak = (total, states, key)

    min_order, singles = max_order + 1, []
    if peak is not None and not lost:
        cache = _cut_cache if _cut_cache is not None else {}
        ck = (peak[2], tuple(mitig))
        if ck not in cache:
            # Cut sets are evaluated at the window's state with nominal load; capacity margins cover load peaks.
            rep = find_cut_sets(fac, peak[1], max_order=max_order, services=services)
            cache[ck] = rep
        rep = cache[ck]
        if rep.cut_sets:
            min_order = min(c.order for c in rep.cut_sets)
            singles = sorted({c.nodes[0] for c in rep.cut_sets if c.order == 1})
    elif lost:
        min_order = 0

    lost_kw = sum(by_id[n].base_load for n in lost_any)
    score = (
        0 if lost else 1,
        0 if lost_any else 1,
        min_order,
        round(min(worst[0], COMFORTABLE), 3),
        -len(singles),
        -len(mitig),
        -plan.start,
    )
    ev = Evaluation(
        plan.start,
        plan.end,
        mitig,
        lost,
        first_loss,
        lost_any,
        lost_kw,
        min_order,
        singles,
        worst[0],
        worst[1],
        worst[2],
        score,
    )
    if lost:
        ev.reasons.append(f"loses {', '.join(lost)} starting hour {first_loss}")
    elif lost_any:
        ev.reasons.append(f"sheds {len(lost_any)} racks or workloads ({lost_kw:.0f} kW): {', '.join(lost_any[:4])}")
    elif singles:
        ev.reasons.append(f"single point of failure during the window: {', '.join(singles)}")
    if worst[1] is not None and worst[0] < 0.10 and not lost:
        ev.reasons.append(f"headroom {worst[0]:.0%} on {worst[1]} at hour {worst[2]}")
    return ev


def _mitigation_options(task: Task, windows: list[Window], start: int) -> list[list[str]]:
    end = start + task.duration_h
    basic = [SHED, TEMP_COOLING] + [f"postpone:{w.label}" for w in windows if w.start < end and start < w.end]
    opts = [[m] for m in basic]
    opts += [list(c) for c in combinations(basic, 2)]
    return opts


def search_plans(
    facility: Facility,
    task: Task,
    profiles: Profiles | None = None,
    windows: Iterable[Window] = (),
    base_states: Mapping[str, State] | None = None,
    top_n: int = 3,
    max_order: int = 2,
    mitigate: bool = True,
) -> PlanSearch:
    windows = list(windows)
    cache: dict = {}
    starts = range(task.earliest, task.latest - task.duration_h + 1)
    evals = [
        evaluate_plan(facility, Plan(task, s), profiles, windows, base_states, max_order, _cut_cache=cache)
        for s in starts
    ]
    count = len(evals)
    if mitigate:
        best = max((e.score for e in evals), default=None)
        safe_enough = best is not None and best[0] == 1 and best[1] == 1 and best[2] >= 2
        if not safe_enough:
            # Try mitigations on the most promising windows only.
            for e in sorted(evals, key=lambda e: e.score, reverse=True)[: max(top_n, 3)]:
                for m in _mitigation_options(task, windows, e.start):
                    evals.append(
                        evaluate_plan(
                            facility,
                            Plan(task, e.start, m),
                            profiles,
                            windows,
                            base_states,
                            max_order,
                            _cut_cache=cache,
                        )
                    )
                    count += 1
    evals.sort(key=lambda e: e.score, reverse=True)
    top: list[Evaluation] = []
    seen_starts: set[int] = set()
    for e in evals:
        if e.start not in seen_starts and len(top) < top_n and e.score[0] == 1:
            top.append(e)
            seen_starts.add(e.start)
    rejected = [e for e in evals if e not in top]
    if top:
        for e in rejected:
            if not e.lost_services:  # a critical loss already explains itself
                e.reasons.append(_why_below(e, top[0]))
    return PlanSearch(task, top, rejected, count)


def _why_below(e: Evaluation, ref: Evaluation) -> str:
    """The first ranking criterion on which a rejected plan loses to the recommended one."""
    if e.score[1] < ref.score[1]:
        return "sheds load; the recommended plan sheds none"
    if e.score[2] < ref.score[2]:
        return f"cut-set order {e.min_cut_order} vs {ref.min_cut_order} for the recommended plan"
    if e.score[3] < ref.score[3]:
        return f"lower headroom ({e.min_margin:.0%}) than the recommended plan ({ref.min_margin:.0%})"
    if e.score[4] < ref.score[4]:
        extra = sorted(set(e.single_points) - set(ref.single_points))
        return f"more single points of failure than the recommended plan ({', '.join(extra) or len(e.single_points)})"
    if e.score[5] < ref.score[5]:
        n = len(e.mitigations)
        return f"same risk but needs {n} mitigation{'s' * (n != 1)}; the recommended plan needs {len(ref.mitigations)}"
    if e.start != ref.start:
        return f"same risk as the recommended plan (hour {ref.start}), but a later start"
    return "same risk as the recommended plan, which was found first"


def compare(a: Evaluation, b: Evaluation) -> dict[str, tuple]:
    fields = [
        "start",
        "end",
        "mitigations",
        "lost_services",
        "lost_load",
        "lost_kw",
        "min_cut_order",
        "single_points",
        "min_margin",
        "tightest",
        "tightest_hour",
    ]
    return {f: (getattr(a, f), getattr(b, f)) for f in fields if getattr(a, f) != getattr(b, f)}
