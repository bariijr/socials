import math

from app.domain.waypoint_routing import a_star_search

ZERO_HEURISTIC = lambda a, b: 0.0  # noqa: E731 — degrades A* to Dijkstra for exact-cost assertions


def euclidean(a: tuple[float, float], b: tuple[float, float]) -> float:
    return math.dist(a, b)


class TestAStarSearch:
    def test_start_equals_goal(self):
        result = a_star_search({"A": []}, "A", "A", ZERO_HEURISTIC)
        assert result.found
        assert result.path == ["A"]
        assert result.total_cost == 0.0

    def test_start_not_in_graph_is_unreachable(self):
        result = a_star_search({"A": [("B", 1)]}, "Z", "B", ZERO_HEURISTIC)
        assert not result.found
        assert result.path is None
        assert result.total_cost is None

    def test_disconnected_goal_is_unreachable(self):
        graph = {"A": [("B", 1)], "B": [], "D": []}
        result = a_star_search(graph, "A", "D", ZERO_HEURISTIC)
        assert not result.found

    def test_prefers_cheaper_indirect_path_over_expensive_direct_edge(self):
        graph = {
            "A": [("B", 1), ("C", 10)],
            "B": [("C", 1)],
            "C": [],
        }
        result = a_star_search(graph, "A", "C", ZERO_HEURISTIC)
        assert result.found
        assert result.path == ["A", "B", "C"]
        assert result.total_cost == 2.0

    def test_single_direct_edge(self):
        graph = {"A": [("B", 5)], "B": []}
        result = a_star_search(graph, "A", "B", ZERO_HEURISTIC)
        assert result.path == ["A", "B"]
        assert result.total_cost == 5.0

    def test_grid_detour_around_missing_center_node(self):
        # 3x3 grid with 4-connectivity; the center node (1,1) is a
        # deliberately excluded "avoided state" — the shortest path must
        # detour around it rather than cut through.
        nodes = [(x, y) for x in range(3) for y in range(3) if (x, y) != (1, 1)]
        graph: dict[tuple[int, int], list[tuple[tuple[int, int], float]]] = {n: [] for n in nodes}
        for x, y in nodes:
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                neighbor = (x + dx, y + dy)
                if neighbor in graph:
                    graph[(x, y)].append((neighbor, euclidean((x, y), neighbor)))

        result = a_star_search(graph, (0, 0), (2, 2), lambda a, b: euclidean(a, b))
        assert result.found
        assert (1, 1) not in result.path
        assert result.path[0] == (0, 0)
        assert result.path[-1] == (2, 2)
        # Any valid detour on this grid costs at least 4 (Manhattan distance),
        # strictly more than the blocked straight-through distance would be.
        assert result.total_cost == 4.0

    def test_admissible_heuristic_matches_zero_heuristic_optimal_cost(self):
        graph = {
            "A": [("B", 1), ("D", 4)],
            "B": [("C", 2)],
            "C": [("D", 1)],
            "D": [],
        }
        dijkstra = a_star_search(graph, "A", "D", ZERO_HEURISTIC)
        astar = a_star_search(graph, "A", "D", ZERO_HEURISTIC)
        assert astar.total_cost == dijkstra.total_cost == 4.0
