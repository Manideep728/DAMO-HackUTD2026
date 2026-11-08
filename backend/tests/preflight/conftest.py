import os

# Tests never reach the meter database or a developer's snapshot; meter tests build what they need.
os.environ["PREFLIGHT_METERS"] = "off"
