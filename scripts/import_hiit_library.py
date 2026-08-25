#!/usr/bin/env python3
"""Convert the canonical Markdown HIIT library into browser-ready data."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path


ROUTINE_ROW = re.compile(r"^\| \*\*(H\d{2}) — ([^*]+)\*\* \|")
SUMMARY_ROW = re.compile(r"^\| \*\*(H\d{2})\*\* \| ([^|]+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \|$")
CITATION = re.compile(r"\s*(?:file)?cite[^]+")
TAG = re.compile(r"(TIPO|EQ|REG|PAT|FORM|NIV|DUR|LOG|COMP):([^\s`]+)")
EXERCISE_ID = re.compile(r"\bE\d{2}\b")
DURATION_BOUNDS = {"XS": (8, 12), "S": (12, 18), "M": (18, 24), "L": (24, 30)}
LEVEL_LABELS = {
    "B": "Básico",
    "B-I": "Básico–intermedio",
    "I": "Intermedio",
    "I-A": "Intermedio–avanzado",
    "A": "Avanzado",
}
FAMILIES = {
    range(1, 9): "Echo Rower",
    range(9, 17): "Kettlebell",
    range(17, 25): "SmartBells sin banco",
    range(25, 31): "SmartBells + banco",
    range(31, 39): "Monster Bands",
    range(39, 43): "Peso corporal y attachments",
    range(43, 49): "Híbridas con Rower",
}
REGION_ALIASES = {
    "FULL": "full-body",
    "CARDIO": "cardio",
    "LOWER": "inferior",
    "POST": "posterior",
    "POSTERIOR": "posterior",
    "UPPER": "superior",
    "PUSH": "push",
    "PULL": "pull",
    "CORE": "core",
    "GLUTE": "glúteos",
    "GLÚTEO": "glúteos",
}
PATTERN_ALIASES = {
    "ROW": "remo",
    "SQUAT": "squat",
    "HINGE": "hinge",
    "PUSH": "push",
    "PULL": "pull",
    "CARRY": "carry",
    "ROT": "rotación",
    "ANTI-ROT": "anti-rotación",
    "MIX": "mixto",
    "UNILATERAL": "unilateral",
    "LUNGE": "lunge",
    "HIP": "extensión-cadera",
}


def clean(value: str) -> str:
    value = CITATION.sub("", value)
    value = value.replace("**", "").replace("`", "")
    return re.sub(r"\s+", " ", value).strip()


def unique(values: list[str]) -> list[str]:
    return list(dict.fromkeys(value for value in values if value))


def duration_codes(value: str) -> list[str]:
    codes = re.findall(r"XS|S|M|L", value)
    if not codes:
        raise ValueError(f"Duración HIIT desconocida: {value}")
    return unique(codes)


def types(value: str) -> list[str]:
    if value == "INT-CORE":
        return [value]
    return unique(re.split(r"[/\-]", value))


def regions(value: str) -> list[str]:
    return unique([REGION_ALIASES.get(part.strip().upper(), part.strip().lower()) for part in value.split("/")])


def patterns(value: str) -> list[str]:
    if not value:
        return []
    raw_parts = []
    for slash_part in value.split("/"):
        if slash_part == "ANTI-ROT":
            raw_parts.append(slash_part)
        else:
            raw_parts.extend(slash_part.split("+"))
    return unique([PATTERN_ALIASES.get(part, part.lower()) for part in raw_parts])


def family_for(source_id: str) -> str:
    number = int(source_id[1:])
    return next(label for numbers, label in FAMILIES.items() if number in numbers)


def parse(source: Path) -> list[dict]:
    lines = source.read_text(encoding="utf-8").splitlines()
    summaries = {}
    for line in lines:
        match = SUMMARY_ROW.match(line)
        if match:
            summaries[match.group(1)] = {
                "shortName": clean(match.group(2)),
                "equipment": clean(match.group(3)),
                "region": clean(match.group(4)),
                "type": clean(match.group(5)),
                "logistics": clean(match.group(6)),
            }

    routines = []
    for line in lines:
        match = ROUTINE_ROW.match(line)
        if not match:
            continue
        cells = [part.strip() for part in line.split("|")[1:-1]]
        if len(cells) != 4:
            raise ValueError(f"Fila {match.group(1)} con {len(cells)} columnas")
        source_id, title = match.groups()
        block, description, tag_cell = cells[1:]
        raw_tags = dict(TAG.findall(tag_cell))
        required = {"TIPO", "EQ", "NIV", "DUR", "LOG"}
        missing = required - raw_tags.keys()
        if missing:
            raise ValueError(f"{source_id} sin etiquetas requeridas: {sorted(missing)}")
        summary = summaries.get(source_id)
        if not summary:
            raise ValueError(f"{source_id} no aparece en el índice maestro")
        codes = duration_codes(raw_tags["DUR"])
        minimum = min(DURATION_BOUNDS[code][0] for code in codes)
        maximum = max(DURATION_BOUNDS[code][1] for code in codes)
        level_code = raw_tags["NIV"]
        if level_code not in LEVEL_LABELS:
            raise ValueError(f"{source_id} usa un nivel desconocido: {level_code}")
        raw_region = raw_tags.get("REG") or summary["region"]
        exercise_ids = unique(EXERCISE_ID.findall(f"{block} {description}"))
        raw_equipment = raw_tags["EQ"]
        rower_based = raw_equipment == "ROW" or raw_equipment.startswith("ROW+")
        warmup = (
            "6–10 minutos progresivos, incluyendo varias aceleraciones breves antes del primer intervalo."
            if rower_based
            else "5–8 minutos de movilidad específica y uno o dos ciclos de los movimientos principales a intensidad baja."
        )
        if source_id in {"H04", "H10", "H15"}:
            warmup += " Utilizar el extremo superior de este calentamiento."
        sequence = clean(block)
        routine = {
            "id": source_id,
            "title": title.strip(),
            "shortName": summary["shortName"],
            "library": "hiit",
            "section": family_for(source_id),
            "description": clean(description),
            "sequence": sequence,
            "logistics": "",
            "warmup": warmup,
            "safety": "Nunca se modifica un selector SmartBell, una kettlebell ajustable, un anclaje o un attachment durante un intervalo de trabajo.",
            "tagsRaw": clean(tag_cell),
            "types": types(raw_tags["TIPO"]),
            "objectives": [],
            "regions": regions(raw_region),
            "patterns": patterns(raw_tags.get("PAT", "")),
            "equipment": [raw_equipment],
            "stations": [],
            "level": LEVEL_LABELS[level_code],
            "levelCode": level_code,
            "durations": codes,
            "durationLabel": f"{raw_tags['DUR']} · bloque {minimum}–{maximum} min + calentamiento/vuelta a la calma",
            "durationRange": [minimum, maximum],
            "estimatedMinutes": round((minimum + maximum) / 2),
            "durationBasis": "main-block",
            "formats": [raw_tags["FORM"]] if raw_tags.get("FORM") else [],
            "logisticsChanges": re.findall(r"\d+", raw_tags["LOG"]),
            "logisticsLabel": raw_tags["LOG"],
            "complements": raw_tags.get("COMP", "").split("/") if raw_tags.get("COMP") else [],
            "exerciseSourceIds": exercise_ids,
            "items": [{
                "kind": "protocol",
                "prescription": sequence,
                "instruction": sequence,
                "optional": False,
            }],
        }
        routines.append(routine)

    expected_ids = [f"H{number:02d}" for number in range(1, 49)]
    ids = [routine["id"] for routine in routines]
    if ids != expected_ids:
        raise ValueError(f"Se esperaban H01–H48 en orden; obtenidos: {ids}")
    if list(summaries) != expected_ids:
        raise ValueError("El índice maestro debe contener exactamente H01–H48 en orden")
    return routines


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Uso: import_hiit_library.py biblioteca-hiit.md")
    routines = parse(Path(sys.argv[1]))
    payload = json.dumps(routines, ensure_ascii=False, indent=2)
    print("/* Generado desde Biblioteca final de rutinas HIIT. No editar manualmente. */")
    print('(function (root) {\n  "use strict";')
    print(f"  root.TrainingHiitRoutineBlueprints = {payload};")
    print('})(typeof window !== "undefined" ? window : globalThis);')


if __name__ == "__main__":
    main()
