#!/usr/bin/env python3
"""Construye y valida el artefacto estático publicado en GitHub Pages."""

from __future__ import annotations

import argparse
import shutil
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit


PROJECT_ROOT = Path(__file__).resolve().parent.parent
PUBLIC_ENTRIES = ("index.html", "css", "js", "public")


class AssetReferenceParser(HTMLParser):
    """Recoge los recursos locales cargados directamente por el documento."""

    def __init__(self) -> None:
        super().__init__()
        self.references: list[tuple[str, str]] = []

    def handle_starttag(self, tag: str, attributes: list[tuple[str, str | None]]) -> None:
        attribute_map = dict(attributes)
        attribute_name = "href" if tag == "link" else "src" if tag in {"script", "img", "source"} else None
        if attribute_name and attribute_map.get(attribute_name):
            self.references.append((tag, attribute_map[attribute_name] or ""))


def safe_output_path(raw_output: str) -> Path:
    output = (PROJECT_ROOT / raw_output).resolve()
    if output == PROJECT_ROOT or PROJECT_ROOT not in output.parents:
        raise ValueError("El directorio de salida debe estar dentro del proyecto y no puede ser su raíz.")
    return output


def copy_public_site(output: Path) -> None:
    if output.exists():
        shutil.rmtree(output)
    output.mkdir(parents=True)

    for entry_name in PUBLIC_ENTRIES:
        source = PROJECT_ROOT / entry_name
        destination = output / entry_name
        if source.is_dir():
            shutil.copytree(source, destination)
        elif source.is_file():
            shutil.copy2(source, destination)
        else:
            raise FileNotFoundError(f"Falta el recurso público obligatorio: {entry_name}")

    (output / ".nojekyll").write_text("", encoding="utf-8")


def validate_index_references(output: Path) -> None:
    parser = AssetReferenceParser()
    parser.feed((output / "index.html").read_text(encoding="utf-8"))

    errors: list[str] = []
    for tag, reference in parser.references:
        parsed = urlsplit(reference)
        if parsed.scheme or parsed.netloc or reference.startswith(("#", "data:")):
            continue
        if parsed.path.startswith("/"):
            errors.append(f"{tag}: la ruta absoluta {reference!r} no funciona bajo el subdirectorio de Pages")
            continue
        target = output / unquote(parsed.path)
        if not target.is_file():
            errors.append(f"{tag}: no existe el recurso local {reference!r}")

    if errors:
        raise ValueError("Referencias inválidas en index.html:\n- " + "\n- ".join(errors))


def validate_artifact(output: Path) -> tuple[int, int]:
    symlinks = [path.relative_to(output) for path in output.rglob("*") if path.is_symlink()]
    if symlinks:
        raise ValueError(f"El artefacto no puede contener enlaces simbólicos: {symlinks}")

    validate_index_references(output)
    files = [path for path in output.rglob("*") if path.is_file()]
    total_bytes = sum(path.stat().st_size for path in files)
    if not files or total_bytes == 0:
        raise ValueError("El artefacto de Pages está vacío.")
    return len(files), total_bytes


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="dist", help="Directorio de salida relativo a la raíz del proyecto")
    arguments = parser.parse_args()

    output = safe_output_path(arguments.output)
    copy_public_site(output)
    file_count, total_bytes = validate_artifact(output)
    relative_output = output.relative_to(PROJECT_ROOT)
    print(f"Artefacto de Pages validado: {file_count} archivos, {total_bytes / 1024 / 1024:.2f} MiB en {relative_output}/")


if __name__ == "__main__":
    main()
