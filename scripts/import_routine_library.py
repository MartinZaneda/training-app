#!/usr/bin/env python3
"""Convert the canonical Markdown routine library into browser-ready data."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path


ROUTINE_ROW = re.compile(r"^\| \*\*(R\d{2}) — ([^*]+)\*\* \|")
EXERCISE = re.compile(r"\*\*(E\d{2})([^*]*)\*\*")
CITATION = re.compile(r"\s*(?:file)?cite[^]+")
TAG = re.compile(r"(REG|OBJ|PAT|EQ|EST|NIV|DUR|FORM|LOG):([^\s`]+)")
DURATION_BOUNDS = {"XS": (15, 25), "S": (25, 35), "M": (35, 50), "L": (50, 70)}
LEVEL_LABELS = {
    "B": "Básico",
    "B-I": "Básico–intermedio",
    "I": "Intermedio",
    "I-A": "Intermedio–avanzado",
    "A": "Avanzado",
}
SECTION_NAMES = {
    "Rutinas focalizadas por grupos musculares": "Focalizadas por grupos musculares",
    "Rutinas de tren superior y tren inferior": "Tren superior e inferior",
    "Rutinas de cuerpo completo y sesiones agrupadas por equipamiento": "Cuerpo completo y por equipamiento",
    "Rutinas cardiovasculares e híbridas con Echo Rower": "Cardiovasculares e híbridas",
}


def clean(value: str) -> str:
    value = CITATION.sub("", value)
    value = value.replace("**", "").replace("`", "")
    return re.sub(r"\s+", " ", value).strip()


def split_path(value: str) -> list[str]:
    return [item for item in value.split("/") if item]


def patterns(value: str) -> list[str]:
    parts = split_path(value)
    if len(parts) == 2 and parts[1] in {"H", "V"} and parts[0].endswith("-H"):
        return [parts[0], f"{parts[0][:-1]}V"]
    return parts


def equipment(value: str) -> list[str]:
    aliases = {"barra": "barra-band"}
    return list(dict.fromkeys(aliases.get(item, item) for item in re.split(r"[+/]", value) if item))


def duration_metadata(cells: list[str], duration_codes: list[str]) -> tuple[str, list[int], int]:
    explicit = re.search(r"\*\*(\d+)[–-](\d+) min", cells[1]) if len(cells) == 5 else None
    if explicit:
        minimum, maximum = map(int, explicit.groups())
        label = f"{minimum}–{maximum} min"
    else:
        bounds = [DURATION_BOUNDS[code] for code in duration_codes]
        minimum = min(item[0] for item in bounds)
        maximum = max(item[1] for item in bounds)
        label = f"{'/'.join(duration_codes)} · {minimum}–{maximum} min"
    return label, [minimum, maximum], round((minimum + maximum) / 2)


def prescription(value: str) -> str:
    patterns_to_try = [
        r"\d+(?:–\d+)?×\d+(?:–\d+)? min [^→+]+",
        r"\d+(?:–\d+)?×\d+(?:–\d+)?(?:\s*s)?(?:/lado)?",
        r"\d+(?:–\d+)? min",
        r"\d+ paladas",
    ]
    for pattern in patterns_to_try:
        match = re.search(pattern, value)
        if match:
            return match.group(0)
    return "Según protocolo"


def items_from_sequence(sequence: str) -> list[dict]:
    matches = list(EXERCISE.finditer(sequence))
    items: list[dict] = []
    for index, match in enumerate(matches):
        previous_end = matches[index - 1].end() if index else 0
        next_start = matches[index + 1].start() if index + 1 < len(matches) else len(sequence)
        prefix = sequence[previous_end:match.start()]
        tail = sequence[match.end():next_start]
        local_prefix = re.split(r"→|\+", prefix)[-1]
        local_tail = re.split(r"→|\+", tail)[0]
        inline = clean(match.group(2))
        local_text = clean(f"{inline} {local_tail}").strip(" .;")
        if len(matches) == 1:
            instruction = clean(sequence)
            target = instruction
        else:
            target = prescription(local_text)
            instruction = target
        optional_prefix = clean(local_prefix).lower()
        optional_tail = local_text.lower()
        is_optional = "opcional" in optional_prefix or "opcional como" in optional_tail
        items.append({
            "kind": "exercise",
            "exerciseSourceId": match.group(1),
            "prescription": target,
            "instruction": instruction,
            "optional": is_optional,
        })
    return items


def parse(source: Path) -> list[dict]:
    routines: list[dict] = []
    section = ""
    for line in source.read_text(encoding="utf-8").splitlines():
        if line.startswith("## "):
            section = SECTION_NAMES.get(clean(line[3:]), section)
        match = ROUTINE_ROW.match(line)
        if not match:
            continue
        cells = [part.strip() for part in line.split("|")[1:-1]]
        if len(cells) not in {4, 5}:
            raise ValueError(f"Fila {match.group(1)} con {len(cells)} columnas")
        if len(cells) == 5:
            description, sequence, logistics, tag_cell = cells[1:]
        else:
            sequence, description, tag_cell = cells[1:]
            logistics = ""
        raw_tags = dict(TAG.findall(tag_cell))
        required = {"REG", "OBJ", "EQ", "NIV", "DUR", "LOG"}
        missing = required - raw_tags.keys()
        if missing:
            raise ValueError(f"{match.group(1)} sin etiquetas requeridas: {sorted(missing)}")
        duration_codes = split_path(raw_tags["DUR"])
        duration_label, duration_range, estimated_minutes = duration_metadata(cells, duration_codes)
        level_code = raw_tags["NIV"]
        if level_code not in LEVEL_LABELS:
            raise ValueError(f"{match.group(1)} usa un nivel desconocido: {level_code}")
        log_raw = raw_tags["LOG"]
        log_values = re.findall(r"\d+", log_raw)
        routine = {
            "id": match.group(1),
            "title": match.group(2).strip(),
            "library": "general",
            "section": section,
            "description": clean(description),
            "sequence": clean(sequence),
            "logistics": clean(logistics),
            "tagsRaw": clean(tag_cell),
            "types": [],
            "regions": split_path(raw_tags["REG"]),
            "objectives": split_path(raw_tags["OBJ"]),
            "patterns": patterns(raw_tags.get("PAT", "")),
            "equipment": equipment(raw_tags["EQ"]),
            "stations": raw_tags.get("EST", "").split(">") if raw_tags.get("EST") else [],
            "level": LEVEL_LABELS[level_code],
            "levelCode": level_code,
            "durations": duration_codes,
            "durationLabel": duration_label,
            "durationRange": duration_range,
            "estimatedMinutes": estimated_minutes,
            "durationBasis": "session",
            "formats": split_path(raw_tags.get("FORM", "")),
            "logisticsChanges": log_values,
            "logisticsLabel": log_raw.replace("-", "–"),
            "complements": [],
            "items": items_from_sequence(sequence),
        }
        routine["exerciseSourceIds"] = [item["exerciseSourceId"] for item in routine["items"]]
        routines.append(routine)

    expected_ids = [f"R{number:02d}" for number in range(1, 47)]
    ids = [routine["id"] for routine in routines]
    if ids != expected_ids:
        raise ValueError(f"Se esperaban R01–R46 en orden; obtenidos: {ids}")
    exercise_ids = {item["exerciseSourceId"] for routine in routines for item in routine["items"]}
    expected_exercises = {f"E{number:02d}" for number in range(1, 91)}
    if exercise_ids != expected_exercises:
        raise ValueError(f"Cobertura incorrecta. Faltan {sorted(expected_exercises - exercise_ids)}")
    return routines


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Uso: import_routine_library.py biblioteca-rutinas.md")
    routines = parse(Path(sys.argv[1]))
    payload = json.dumps(routines, ensure_ascii=False, indent=2)
    print("/* Generado desde Biblioteca final de rutinas. No editar manualmente. */")
    print('(function (root) {\n  "use strict";')
    print(f"  root.TrainingRoutineBlueprints = {payload};")
    print('})(typeof window !== "undefined" ? window : globalThis);')


if __name__ == "__main__":
    main()
