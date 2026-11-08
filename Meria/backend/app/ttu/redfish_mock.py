"""A minimal HTTPS Redfish BMC for replaying scenarios against the unmodified TTU plugin.

Serves, per asset under /bmc/<asset_id>:
  /redfish/v1/Chassis/                       -> Members[0] = /redfish/v1/Chassis/System.Embedded.1
  /redfish/v1/Chassis/System.Embedded.1/Thermal/
  /redfish/v1/Managers/ and /redfish/v1/Managers/iDRAC.Embedded.1
Resource shapes follow the DMTF Redfish Thermal and Manager schemas (only the fields the plugin reads, plus fans).
The plugin is invoked with host "127.0.0.1:<port>/bmc/<asset_id>", so its URLs resolve here unchanged.
"""
import json, ssl, subprocess, threading, pathlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from . import BACKEND

CERT_DIR = BACKEND / ".certs"
STATE: dict = {}          # asset_id -> {"health": "OK"|"Warning"|"Critical"|None, "fan_rpm": int, "down": bool}
_server = None


def set_state(asset_id, health="OK", fan_rpm=9400, down=False):
    STATE[asset_id] = {"health": health, "fan_rpm": fan_rpm, "down": down}


def _thermal(st):
    temps = []
    if st["health"] is not None:
        reading = {"OK": 61, "Warning": 84, "Critical": 91}[st["health"]]
        temps = [{"Name": "CPU1 Temp", "ReadingCelsius": reading, "Status": {"State": "Enabled", "Health": st["health"]}},
                 {"Name": "System Board Inlet Temp", "ReadingCelsius": 22, "Status": {"State": "Enabled", "Health": "OK"}}]
    fans = [{"Name": f"Fan{i}", "Reading": st["fan_rpm"] if i == 4 else 9400, "ReadingUnits": "RPM",
             "Status": {"State": "Enabled", "Health": "Critical" if i == 4 and st["fan_rpm"] == 0 else "OK"}} for i in range(1, 7)]
    return {"@odata.id": "/redfish/v1/Chassis/System.Embedded.1/Thermal", "Id": "Thermal", "Temperatures": temps, "Fans": fans}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):  # quiet
        pass

    def do_GET(self):
        parts = self.path.split("/", 3)  # "", "bmc", asset, rest
        if len(parts) < 4 or parts[1] != "bmc":
            return self._send(404, {"error": "not found"})
        asset, rest = parts[2], "/" + parts[3].rstrip("/")
        st = STATE.get(asset, {"health": "OK", "fan_rpm": 9400, "down": False})
        if st.get("down"):
            self.close_connection = True
            return  # BMC unreachable: drop the connection
        routes = {
            "/redfish/v1/Chassis": {"Members": [{"@odata.id": "/redfish/v1/Chassis/System.Embedded.1"}]},
            "/redfish/v1/Chassis/System.Embedded.1/Thermal": _thermal(st),
            "/redfish/v1/Managers": {"Members": [{"@odata.id": "/redfish/v1/Managers/iDRAC.Embedded.1"}]},
            "/redfish/v1/Managers/iDRAC.Embedded.1": {"Id": "iDRAC.Embedded.1", "Status": {"State": "Enabled", "Health": "OK"}},
        }
        if rest in routes:
            return self._send(200, routes[rest])
        return self._send(404, {"error": rest})

    def _send(self, code, body):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def _ensure_cert():
    CERT_DIR.mkdir(exist_ok=True)
    crt, key = CERT_DIR / "bmc.crt", CERT_DIR / "bmc.key"
    if not crt.exists():
        subprocess.run(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "30", "-subj", "/CN=127.0.0.1",
                        "-keyout", str(key), "-out", str(crt)], check=True, capture_output=True)
    return crt, key


def start(port=8443):
    """Start the mock once; returns the base host for the plugin (without asset path)."""
    global _server
    if _server is None:
        crt, key = _ensure_cert()
        srv = ThreadingHTTPServer(("127.0.0.1", port), Handler)
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(str(crt), str(key))
        srv.socket = ctx.wrap_socket(srv.socket, server_side=True)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        _server = srv
    return f"127.0.0.1:{_server.server_address[1]}"


def thermal_json(health, fan_rpm=9400):
    """The exact Thermal body the mock serves, for showing in the UI."""
    return _thermal({"health": health, "fan_rpm": fan_rpm})
