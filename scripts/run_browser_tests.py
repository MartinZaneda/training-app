#!/usr/bin/env python3
"""Ejecuta los gates de navegador con servicios locales autogestionados."""

from __future__ import annotations

import argparse
import os
import signal
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path
from typing import IO


PROJECT_ROOT = Path(__file__).resolve().parent.parent
CHROME_CANDIDATES = ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser")


def available_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        listener.bind(("127.0.0.1", 0))
        return int(listener.getsockname()[1])


def wait_for_url(url: str, process: subprocess.Popen[str], timeout: float = 20) -> None:
    deadline = time.monotonic() + timeout
    last_error: Exception | None = None
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError(f"El proceso terminó antes de servir {url} (código {process.returncode}).")
        try:
            with urllib.request.urlopen(url, timeout=1) as response:
                if response.status < 500:
                    return
        except Exception as error:  # El servicio puede tardar varios intentos en arrancar.
            last_error = error
        time.sleep(0.1)
    raise TimeoutError(f"No se pudo acceder a {url}: {last_error}")


def browser_binary() -> str:
    configured = os.environ.get("CHROME_BIN")
    if configured:
        resolved = shutil.which(configured) if not Path(configured).is_file() else configured
        if resolved:
            return str(resolved)
        raise FileNotFoundError(f"CHROME_BIN no apunta a un ejecutable válido: {configured}")
    for candidate in CHROME_CANDIDATES:
        resolved = shutil.which(candidate)
        if resolved:
            return resolved
    raise FileNotFoundError("No se encontró Chrome o Chromium. Define CHROME_BIN para indicar su ejecutable.")


def stop_process(process: subprocess.Popen[str] | None) -> None:
    if not process:
        return
    try:
        os.killpg(process.pid, signal.SIGTERM)
    except ProcessLookupError:
        return
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.wait(timeout=5)


def log_tail(stream: IO[str], limit: int = 5000) -> str:
    stream.flush()
    stream.seek(0)
    return stream.read()[-limit:]


def run_gate(script: str, arguments: list[str]) -> None:
    result = subprocess.run(
        [sys.executable, script, *arguments],
        cwd=PROJECT_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.stdout:
        print(result.stdout, end="", flush=True)
    if result.stderr:
        print(result.stderr, end="", file=sys.stderr, flush=True)
    if result.returncode:
        raise RuntimeError(f"El gate {script} terminó con código {result.returncode}.")


def site_root_path(raw_path: str) -> Path:
    site_root = (PROJECT_ROOT / raw_path).resolve()
    if site_root != PROJECT_ROOT and PROJECT_ROOT not in site_root.parents:
        raise ValueError("La raíz servida debe estar dentro del proyecto.")
    if not (site_root / "index.html").is_file():
        raise FileNotFoundError(f"No existe index.html en la raíz servida: {site_root}")
    return site_root


def run(site_root: Path) -> None:
    http_port = available_port()
    debug_port = available_port()
    while debug_port == http_port:
        debug_port = available_port()
    base_url = f"http://127.0.0.1:{http_port}/"
    server: subprocess.Popen[str] | None = None
    chrome: subprocess.Popen[str] | None = None

    with tempfile.TemporaryDirectory(prefix="training-app-chrome-", ignore_cleanup_errors=True) as profile_dir:
        with tempfile.TemporaryFile(mode="w+", encoding="utf-8") as server_log:
            with tempfile.TemporaryFile(mode="w+", encoding="utf-8") as chrome_log:
                try:
                    server = subprocess.Popen(
                        [sys.executable, "-m", "http.server", str(http_port), "--bind", "127.0.0.1"],
                        cwd=site_root,
                        stdout=server_log,
                        stderr=subprocess.STDOUT,
                        text=True,
                        start_new_session=True,
                    )
                    wait_for_url(base_url, server)

                    chrome = subprocess.Popen(
                        [
                            browser_binary(),
                            "--headless=new",
                            "--no-sandbox",
                            "--disable-gpu",
                            "--disable-dev-shm-usage",
                            "--disable-background-networking",
                            "--disable-component-update",
                            "--disable-default-apps",
                            "--disable-extensions",
                            "--disable-sync",
                            "--metrics-recording-only",
                            "--mute-audio",
                            "--no-first-run",
                            "--no-default-browser-check",
                            "--remote-debugging-address=127.0.0.1",
                            f"--remote-debugging-port={debug_port}",
                            f"--remote-allow-origins=http://127.0.0.1:{debug_port}",
                            f"--user-data-dir={profile_dir}",
                            "about:blank",
                        ],
                        cwd=PROJECT_ROOT,
                        stdout=chrome_log,
                        stderr=subprocess.STDOUT,
                        text=True,
                        start_new_session=True,
                    )
                    wait_for_url(f"http://127.0.0.1:{debug_port}/json/version", chrome)

                    common_arguments = ["--port", str(debug_port), "--url", base_url]
                    run_gate("tests/browser_smoke.py", common_arguments)
                    run_gate("tests/data_actions_browser.py", common_arguments)
                except Exception:
                    print("\nÚltimas líneas del servidor local:\n" + log_tail(server_log), file=sys.stderr)
                    print("\nÚltimas líneas de Chrome:\n" + log_tail(chrome_log), file=sys.stderr)
                    raise
                finally:
                    stop_process(chrome)
                    stop_process(server)


if __name__ == "__main__":
    argument_parser = argparse.ArgumentParser()
    argument_parser.add_argument(
        "--site-root",
        default=".",
        help="Directorio del sitio relativo a la raíz del proyecto (por defecto, el código fuente)",
    )
    run(site_root_path(argument_parser.parse_args().site_root))
