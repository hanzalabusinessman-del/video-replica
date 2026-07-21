"""JSON-lines media analysis worker used by the Electron main process."""
from __future__ import annotations
import json
import sys
from pathlib import Path

def analyze_media(path: str) -> dict:
    try:
        import cv2
        cap = cv2.VideoCapture(path)
        frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps = float(cap.get(cv2.CAP_PROP_FPS) or 0)
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        cap.release()
        return {"width": width, "height": height, "fps": fps, "frames": frames, "duration": frames / fps if fps else 0}
    except Exception as exc:
        return {"error": str(exc)}

def handle(message: dict) -> dict:
    task = message.get("task")
    if task == "health":
        return {"ok": True, "python": sys.version.split()[0]}
    if task == "analyze_media":
        path = str(message.get("path", ""))
        if not Path(path).exists():
            return {"error": "Media file does not exist"}
        return analyze_media(path)
    return {"error": f"Unknown task: {task}"}

for line in sys.stdin:
    try:
        payload = json.loads(line)
        print(json.dumps({"id": payload.get("id"), "result": handle(payload)}), flush=True)
    except Exception as exc:
        print(json.dumps({"error": str(exc)}), flush=True)
