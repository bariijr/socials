"""Generic A* pathfinding — no aviation logic, just graph search.

Engine 2 (permits) uses this to find an alternate route around an
avoid/include violation, over a corridor graph built by
app.services.routing_engine_service. This module knows nothing about
aircraft, states or airports — it operates on a plain adjacency-list graph
of hashable nodes, so it is unit-testable with small synthetic graphs and
reusable anywhere else a shortest path is needed.
"""

import heapq
from collections.abc import Callable, Hashable
from dataclasses import dataclass
from typing import TypeVar

Node = TypeVar("Node", bound=Hashable)


@dataclass(frozen=True)
class AStarResult:
    path: list[Node] | None
    total_cost: float | None

    @property
    def found(self) -> bool:
        return self.path is not None


def a_star_search(
    graph: dict[Node, list[tuple[Node, float]]],
    start: Node,
    goal: Node,
    heuristic_fn: Callable[[Node, Node], float],
) -> AStarResult:
    """Standard A*. `heuristic_fn(node, goal)` must be admissible (never
    overestimate true remaining cost) for the result to be optimal. Returns
    AStarResult(path=None, total_cost=None) when no path exists.
    """
    if start == goal:
        return AStarResult(path=[start], total_cost=0.0)
    if start not in graph:
        return AStarResult(path=None, total_cost=None)

    open_heap: list[tuple[float, int, Node]] = [(heuristic_fn(start, goal), 0, start)]
    came_from: dict[Node, Node] = {}
    g_score: dict[Node, float] = {start: 0.0}
    counter = 1  # tie-breaker so heap never compares Node objects directly

    while open_heap:
        _, _, current = heapq.heappop(open_heap)

        if current == goal:
            path = [current]
            while path[-1] in came_from:
                path.append(came_from[path[-1]])
            path.reverse()
            return AStarResult(path=path, total_cost=g_score[current])

        for neighbor, edge_cost in graph.get(current, []):
            tentative_g = g_score[current] + edge_cost
            if tentative_g < g_score.get(neighbor, float("inf")):
                came_from[neighbor] = current
                g_score[neighbor] = tentative_g
                f_score = tentative_g + heuristic_fn(neighbor, goal)
                heapq.heappush(open_heap, (f_score, counter, neighbor))
                counter += 1

    return AStarResult(path=None, total_cost=None)
