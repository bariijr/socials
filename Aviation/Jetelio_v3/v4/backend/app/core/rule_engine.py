"""The rule-engine version stamp.

Every route/permit computation is logged against this version so a permit
list filed six months ago reproduces exactly, even after the engines
change (spec: "log every route computation with a rule-engine version").
Bump on any change to domain logic in app/domain/great_circle.py,
waypoint_routing.py, permits.py, capability.py or credentials.py.
"""

RULE_ENGINE_VERSION = "1.0.0"
