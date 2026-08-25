#!/usr/bin/env python3
"""Convert the canonical Markdown exercise library into browser-ready JSON data."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path


DETAIL_ROW = re.compile(r"^\| \*\*(E\d{2}) ([^*]+)\*\* \| (.+) \|$")
SUMMARY_ROW = re.compile(r"^\| (E\d{2}) \| ([^|]+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \|$")
CITATION = re.compile(r"\s*(?:file)?cite[^]+")
NUMBERED_STEP = re.compile(r"(?:^|\s)\d+\.\s+")


def anatomy(primary: str, secondary: str = "") -> dict:
    split = lambda value: [item.strip() for item in value.split("|") if item.strip()]
    return {"primaryMuscles": split(primary), "secondaryMuscles": split(secondary)}


ANATOMY = {
    "E01": anatomy("Pectoral mayor|Tríceps braquial", "Deltoides anterior|Serrato anterior|Core anterior"),
    "E02": anatomy("Pectoral mayor|Tríceps braquial", "Deltoides anterior"),
    "E03": anatomy("Pectoral mayor", "Deltoides anterior|Tríceps braquial"),
    "E04": anatomy("Deltoides anterior|Pectoral mayor", "Tríceps braquial"),
    "E05": anatomy("Pectoral mayor", "Tríceps braquial|Deltoides anterior"),
    "E06": anatomy("Deltoides anterior|Deltoides lateral", "Tríceps braquial|Trapecio|Serrato anterior|Core anterior"),
    "E07": anatomy("Deltoides anterior|Deltoides lateral|Tríceps braquial", "Core anterior|Glúteo mayor|Serrato anterior"),
    "E08": anatomy("Deltoides anterior|Tríceps braquial|Cuádriceps|Glúteo mayor", "Core anterior"),
    "E09": anatomy("Pectoral mayor", "Deltoides anterior|Bíceps braquial"),
    "E10": anatomy("Pectoral mayor", "Deltoides anterior"),
    "E11": anatomy("Dorsal ancho|Pectoral mayor", "Tríceps braquial|Serrato anterior|Core anterior"),
    "E12": anatomy("Deltoides lateral", "Manguito rotador|Trapecio"),
    "E13": anatomy("Deltoides anterior", "Pectoral mayor|Serrato anterior"),
    "E14": anatomy("Pectoral mayor|Tríceps braquial", "Deltoides anterior|Core anterior"),
    "E15": anatomy("Pectoral mayor", "Deltoides anterior|Core anterior"),
    "E16": anatomy("Pectoral mayor", "Deltoides anterior"),
    "E17": anatomy("Pectoral mayor", "Serrato anterior|Core anterior"),
    "E18": anatomy("Tríceps braquial", "Trapecio|Core anterior"),
    "E19": anatomy("Tríceps braquial", "Core anterior"),
    "E20": anatomy("Tríceps braquial", "Deltoides posterior|Core anterior"),
    "E21": anatomy("Pectoral mayor|Tríceps braquial", "Deltoides anterior|Core anterior"),
    "E22": anatomy("Pectoral mayor|Deltoides anterior|Tríceps braquial", "Core anterior"),
    "E23": anatomy("Pectoral mayor|Tríceps braquial", "Core anterior"),
    "E24": anatomy("Deltoides anterior|Tríceps braquial", "Core anterior"),
    "E25": anatomy("Dorsal ancho|Redondo mayor", "Bíceps braquial|Braquial|Romboides|Trapecio|Core anterior|Antebrazos"),
    "E26": anatomy("Dorsal ancho|Bíceps braquial", "Braquial|Antebrazos|Romboides|Core anterior"),
    "E27": anatomy("Dorsal ancho|Trapecio", "Serrato anterior|Core anterior"),
    "E28": anatomy("Dorsal ancho|Romboides", "Bíceps braquial|Deltoides posterior|Core anterior"),
    "E29": anatomy("Dorsal ancho|Romboides", "Bíceps braquial|Deltoides posterior|Erectores espinales|Core anterior"),
    "E30": anatomy("Dorsal ancho|Romboides|Trapecio", "Bíceps braquial|Deltoides posterior"),
    "E31": anatomy("Deltoides posterior|Romboides|Trapecio", "Bíceps braquial"),
    "E32": anatomy("Deltoides posterior|Romboides", "Trapecio"),
    "E33": anatomy("Dorsal ancho|Romboides", "Bíceps braquial|Deltoides posterior|Core anterior"),
    "E34": anatomy("Romboides|Trapecio|Deltoides posterior", "Bíceps braquial|Core anterior"),
    "E35": anatomy("Trapecio|Romboides|Deltoides posterior", "Bíceps braquial|Core anterior"),
    "E36": anatomy("Deltoides posterior|Romboides|Trapecio", "Manguito rotador|Bíceps braquial|Core anterior"),
    "E37": anatomy("Dorsal ancho", "Pectoral mayor|Tríceps braquial|Core anterior"),
    "E38": anatomy("Dorsal ancho|Romboides", "Bíceps braquial|Core anterior"),
    "E39": anatomy("Dorsal ancho", "Bíceps braquial|Romboides|Core anterior"),
    "E40": anatomy("Trapecio", "Antebrazos|Core anterior"),
    "E41": anatomy("Bíceps braquial", "Braquial|Antebrazos|Core anterior"),
    "E42": anatomy("Braquial|Bíceps braquial", "Braquiorradial|Antebrazos|Core anterior"),
    "E43": anatomy("Bíceps braquial", "Braquial|Antebrazos"),
    "E44": anatomy("Bíceps braquial", "Braquial|Antebrazos|Core anterior"),
    "E45": anatomy("Cuádriceps|Glúteo mayor", "Isquiotibiales|Core anterior|Antebrazos"),
    "E46": anatomy("Cuádriceps|Glúteo mayor", "Isquiotibiales|Erectores espinales|Core anterior|Deltoides anterior|Antebrazos"),
    "E47": anatomy("Cuádriceps|Glúteo mayor", "Isquiotibiales|Core anterior|Deltoides anterior"),
    "E48": anatomy("Cuádriceps|Glúteo mayor", "Isquiotibiales|Core anterior"),
    "E49": anatomy("Cuádriceps|Glúteo mayor", "Aductores|Isquiotibiales|Core anterior|Antebrazos"),
    "E50": anatomy("Glúteo mayor|Cuádriceps", "Aductores|Isquiotibiales|Core anterior|Antebrazos"),
    "E51": anatomy("Glúteo mayor|Cuádriceps", "Isquiotibiales|Core anterior|Antebrazos"),
    "E52": anatomy("Cuádriceps|Glúteo mayor", "Aductores|Isquiotibiales|Core anterior|Antebrazos"),
    "E53": anatomy("Glúteo mayor|Cuádriceps|Aductores", "Isquiotibiales|Core anterior|Antebrazos"),
    "E54": anatomy("Gemelos|Sóleo", "Core anterior|Antebrazos"),
    "E55": anatomy("Gemelos|Sóleo", "Glúteo medio|Core anterior|Antebrazos"),
    "E56": anatomy("Glúteo mayor|Cuádriceps|Isquiotibiales", "Erectores espinales|Dorsal ancho|Core anterior|Antebrazos"),
    "E57": anatomy("Isquiotibiales|Glúteo mayor", "Erectores espinales|Core anterior|Antebrazos"),
    "E58": anatomy("Glúteo mayor|Isquiotibiales", "Glúteo medio|Erectores espinales|Oblicuos|Antebrazos"),
    "E59": anatomy("Glúteo mayor|Aductores|Cuádriceps", "Isquiotibiales|Erectores espinales|Core anterior|Antebrazos"),
    "E60": anatomy("Isquiotibiales|Glúteo mayor", "Erectores espinales|Core anterior|Antebrazos"),
    "E61": anatomy("Isquiotibiales|Glúteo mayor", "Erectores espinales|Core anterior"),
    "E62": anatomy("Glúteo mayor|Isquiotibiales", "Erectores espinales|Core anterior"),
    "E63": anatomy("Glúteo mayor", "Isquiotibiales|Cuádriceps|Core anterior"),
    "E64": anatomy("Glúteo mayor", "Isquiotibiales|Oblicuos"),
    "E65": anatomy("Glúteo mayor|Isquiotibiales", "Erectores espinales|Dorsal ancho|Core anterior|Antebrazos"),
    "E66": anatomy("Glúteo mayor|Isquiotibiales", "Oblicuos|Dorsal ancho|Erectores espinales|Antebrazos"),
    "E67": anatomy("Glúteo mayor|Isquiotibiales", "Trapecio|Deltoides anterior|Bíceps braquial|Core anterior|Antebrazos"),
    "E68": anatomy("Glúteo mayor|Isquiotibiales|Trapecio", "Deltoides posterior|Bíceps braquial|Core anterior|Antebrazos"),
    "E69": anatomy("Glúteo mayor|Isquiotibiales|Deltoides anterior", "Tríceps braquial|Dorsal ancho|Erectores espinales|Core anterior|Antebrazos"),
    "E70": anatomy("Core anterior", "Oblicuos"),
    "E71": anatomy("Core anterior|Flexores de cadera", "Oblicuos"),
    "E72": anatomy("Core anterior|Flexores de cadera", "Dorsal ancho|Antebrazos"),
    "E73": anatomy("Core anterior|Flexores de cadera", "Dorsal ancho|Antebrazos"),
    "E74": anatomy("Oblicuos|Core anterior", "Glúteo mayor|Deltoides anterior"),
    "E75": anatomy("Oblicuos|Core anterior", "Dorsal ancho|Deltoides anterior|Glúteo mayor"),
    "E76": anatomy("Oblicuos|Core anterior", "Glúteo mayor|Deltoides anterior|Serrato anterior"),
    "E77": anatomy("Antebrazos|Trapecio|Core anterior", "Glúteo mayor|Cuádriceps|Gemelos|Deltoides lateral"),
    "E78": anatomy("Oblicuos|Cuadrado lumbar|Antebrazos", "Trapecio|Glúteo medio"),
    "E79": anatomy("Manguito rotador|Serrato anterior|Core anterior", "Trapecio|Glúteo mayor|Antebrazos"),
    "E80": anatomy("Core anterior|Deltoides anterior|Glúteo mayor", "Cuádriceps|Isquiotibiales|Erectores espinales|Antebrazos"),
    "E81": anatomy("Oblicuos|Glúteo mayor|Isquiotibiales", "Erectores espinales|Manguito rotador|Antebrazos"),
    "E82": anatomy("Cuádriceps|Glúteo mayor|Deltoides anterior|Tríceps braquial", "Isquiotibiales|Core anterior|Antebrazos"),
    "E83": anatomy("Glúteo mayor|Isquiotibiales|Deltoides anterior|Tríceps braquial", "Dorsal ancho|Erectores espinales|Core anterior|Antebrazos"),
    "E84": anatomy("Dorsal ancho|Romboides", "Core anterior|Pectoral mayor|Tríceps braquial|Glúteo mayor|Antebrazos"),
    "E85": anatomy("Cuádriceps|Glúteo mayor|Dorsal ancho", "Isquiotibiales|Bíceps braquial|Deltoides posterior|Core anterior"),
    "E86": anatomy("Cuádriceps|Glúteo mayor|Dorsal ancho", "Isquiotibiales|Bíceps braquial|Deltoides posterior|Core anterior"),
    "E87": anatomy("Cuádriceps|Glúteo mayor|Dorsal ancho", "Isquiotibiales|Bíceps braquial|Deltoides posterior|Core anterior"),
    "E88": anatomy("Cuádriceps|Glúteo mayor|Dorsal ancho", "Isquiotibiales|Bíceps braquial|Deltoides posterior|Core anterior"),
    "E89": anatomy("Cuádriceps|Glúteo mayor|Dorsal ancho", "Isquiotibiales|Bíceps braquial|Deltoides posterior|Core anterior"),
    "E90": anatomy("Cuádriceps|Glúteo mayor|Dorsal ancho", "Isquiotibiales|Bíceps braquial|Deltoides posterior|Core anterior"),
}


MOVEMENT_PATTERNS: dict[str, list[str]] = {}


def register_patterns(exercise_ids: str, *patterns: str) -> None:
    for exercise_id in exercise_ids.split():
        if exercise_id in MOVEMENT_PATTERNS:
            raise ValueError(f"Patrones duplicados para {exercise_id}.")
        MOVEMENT_PATTERNS[exercise_id] = list(patterns)


register_patterns("E01 E02 E05 E14 E21 E22 E23", "Empuje horizontal")
register_patterns("E03", "Empuje inclinado")
register_patterns("E04", "Empuje inclinado", "Empuje vertical")
register_patterns("E06 E07 E24", "Empuje vertical")
register_patterns("E08", "Empuje vertical", "Potencia de tren inferior")
register_patterns("E09 E10 E15 E16 E17", "Apertura de pecho")
register_patterns("E11 E37", "Extensión de hombro")
register_patterns("E12 E13", "Elevación de hombro")
register_patterns("E18 E19 E20", "Extensión de codo")
register_patterns("E25 E26 E38 E39", "Tirón vertical")
register_patterns("E27 E40", "Control escapular")
register_patterns("E28 E29 E30 E31 E32 E33 E34 E35 E36", "Tirón horizontal")
register_patterns("E41 E42 E43 E44", "Flexión de codo")
register_patterns("E45 E46 E47 E48", "Sentadilla")
register_patterns("E49 E50 E51 E52 E53", "Zancada")
register_patterns("E54", "Flexión plantar")
register_patterns("E55", "Flexión plantar", "Estabilidad unilateral")
register_patterns("E56 E57 E59 E60 E61 E62", "Bisagra de cadera")
register_patterns("E58", "Bisagra de cadera", "Estabilidad unilateral")
register_patterns("E63", "Extensión de cadera")
register_patterns("E64", "Extensión de cadera", "Estabilidad unilateral")
register_patterns("E65 E67", "Potencia de cadera")
register_patterns("E66", "Potencia de cadera", "Antirrotación")
register_patterns("E68", "Potencia de cadera", "Tirón vertical")
register_patterns("E69", "Potencia de cadera", "Estabilidad sobre cabeza")
register_patterns("E70 E71", "Flexión de tronco")
register_patterns("E72 E73", "Elevación de piernas")
register_patterns("E74", "Antirrotación")
register_patterns("E75 E76", "Rotación de tronco")
register_patterns("E77", "Transporte de carga")
register_patterns("E78", "Transporte de carga", "Antiflexión lateral")
register_patterns("E79", "Transporte de carga", "Estabilidad sobre cabeza")
register_patterns("E80", "Integración multiplanar", "Estabilidad sobre cabeza")
register_patterns("E81", "Bisagra de cadera", "Estabilidad sobre cabeza")
register_patterns("E82", "Sentadilla", "Empuje vertical")
register_patterns("E83", "Potencia de cadera", "Empuje vertical")
register_patterns("E84", "Tirón horizontal", "Antirrotación")
register_patterns("E85 E87", "Remo continuo")
register_patterns("E86", "Técnica de remo")
register_patterns("E88", "Intervalos de remo")
register_patterns("E89", "Potencia de remo")
register_patterns("E90", "Potencia de remo", "Técnica de remo")
register_patterns("E91", "Caminata")


IMAGE_BY_ID = {
    "E01": "press-pecho-plano", "E02": "press-pecho-agarre-neutro", "E03": "press-inclinado-mancuernas",
    "E04": "press-inclinado-alto", "E05": "press-declinado-mancuernas", "E06": "press-hombros-sentado",
    "E07": "press-militar-pie-mancuernas", "E08": "push-press-mancuernas", "E09": "aperturas-mancuernas",
    "E10": "aperturas-inclinadas", "E11": "pullover-mancuerna",
    "E12": "elevacion-lateral", "E13": "elevacion-frontal-alterna", "E14": "press-pecho-banda-anclada",
    "E15": "aperturas-banda-anclada", "E16": "fly-banda-bajo-alto", "E17": "fly-banda-alto-bajo",
    "E18": "extension-triceps-banda-alta", "E19": "extension-triceps-cabeza",
    "E20": "patada-triceps-apoyada", "E24": "press-hombros-banda", "E28": "remo-unilateral-apoyado",
    "E21": "flexion-inclinada-banco", "E22": "flexion-pies-elevados-banco", "E23": "flexion-resistida-banda",
    "E25": "dominada-pronada", "E26": "dominada-neutra", "E27": "dominada-escapular",
    "E29": "remo-inclinado-dos-mancuernas", "E30": "remo-pecho-apoyado", "E32": "pajaros-pecho-apoyado",
    "E31": "remo-alto-apoyado", "E33": "remo-banda-anclaje-bajo", "E34": "remo-ancho-barra-banda",
    "E35": "remo-alto-banda", "E36": "face-pull-banda",
    "E37": "jalon-brazos-rectos-banda", "E38": "jalon-sentado-banda-barra", "E39": "jalon-unilateral-banda-agarre",
    "E40": "encogimiento-hombros", "E41": "curl-biceps-alterno", "E42": "curl-martillo",
    "E43": "curl-sentado-inclinado", "E44": "curl-banda", "E45": "sentadilla-goblet-libre",
    "E46": "sentadilla-frontal-dos-mancuernas", "E47": "sentadilla-banda-anclada", "E48": "sentadilla-hacia-banco",
    "E49": "split-squat-mancuernas", "E50": "sentadilla-bulgara-mancuernas", "E51": "zancada-atras-apoyo",
    "E52": "zancada-adelante", "E53": "zancada-lateral", "E54": "elevacion-gemelos-pie",
    "E55": "elevacion-unilateral-talon", "E56": "peso-muerto-mancuernas", "E57": "peso-muerto-rumano-dos-mancuernas",
    "E58": "peso-muerto-una-pierna-apoyo", "E59": "peso-muerto-pesa-rusa", "E60": "peso-muerto-banda-barra",
    "E61": "good-morning-banda", "E62": "pull-through-banda", "E63": "hip-thrust-banco",
    "E64": "hip-thrust-unilateral", "E65": "swing-ruso-pesa-rusa", "E66": "swing-una-mano-pesa-rusa",
    "E67": "clean-rack-pesa-rusa", "E68": "high-pull-pesa-rusa", "E69": "snatch-pesa-rusa",
    "E70": "crunch-sujecion-piernas", "E71": "situp-declinado", "E72": "elevacion-rodillas-colgado",
    "E73": "elevacion-piernas-rectas-colgado", "E74": "pallof-press-banda", "E75": "wood-chop-banda",
    "E76": "lift-banda-bajo-alto", "E77": "paseo-granjero", "E78": "sujecion-maleta",
    "E79": "paseo-sobre-cabeza-unilateral", "E80": "turkish-get-up", "E81": "windmill-pesa-rusa",
    "E82": "sentadilla-press-mancuerna", "E83": "clean-press-pesa-rusa", "E84": "renegade-row-mancuernas",
    "E85": "remo-continuo-suave", "E86": "remo-bloques-suaves-moderados",
    "E87": "remo-continuo-suave", "E88": "remo-bloques-suaves-moderados", "E89": "remo-continuo-suave", "E90": "remo-bloques-suaves-moderados",
}

GROUPS_BY_MUSCLE = {
    "Pectoral mayor": ["Pecho"], "Serrato anterior": ["Pecho", "Hombros"],
    "Deltoides anterior": ["Hombros"], "Deltoides lateral": ["Hombros"], "Deltoides posterior": ["Hombros"],
    "Manguito rotador": ["Hombros"], "Trapecio": ["Espalda", "Hombros"],
    "Tríceps braquial": ["Brazos"], "Bíceps braquial": ["Brazos"], "Braquial": ["Brazos"],
    "Braquiorradial": ["Brazos"], "Antebrazos": ["Brazos"],
    "Dorsal ancho": ["Espalda"], "Redondo mayor": ["Espalda"], "Romboides": ["Espalda"],
    "Erectores espinales": ["Espalda", "Glúteos e isquios", "Core"],
    "Cuádriceps": ["Piernas"], "Gemelos": ["Piernas"], "Sóleo": ["Piernas"],
    "Aductores": ["Piernas", "Glúteos e isquios"], "Glúteo mayor": ["Glúteos e isquios"],
    "Glúteo medio": ["Glúteos e isquios"], "Isquiotibiales": ["Glúteos e isquios"],
    "Core anterior": ["Core"], "Oblicuos": ["Core"], "Cuadrado lumbar": ["Core"],
    "Flexores de cadera": ["Core"],
}


def clean(value: str) -> str:
    value = CITATION.sub("", value)
    value = value.replace("**", "").replace("`", "")
    return re.sub(r"\s+", " ", value).strip()


def public_text(value: str) -> str:
    """Expand source abbreviations before text can reach the interface."""
    value = clean(value)
    replacements = (
        (r"\bDB\s*/\s*KB\b", "mancuerna o pesa rusa"),
        (r"\bKB\s*/\s*DB\b", "pesa rusa o mancuerna"),
        (r"\bKB\s*/\s*una\s+DB\b", "pesa rusa o una mancuerna"),
        (r"\b(?:2|dos)\s+DB\b", "dos mancuernas"),
        (r"\b(?:1|una)\s+DB\b", "una mancuerna"),
        (r"\bDB\b", "mancuernas"),
        (r"\bKB\b", "pesa rusa"),
        (r"\bRDL\b", "peso muerto rumano"),
        (r"\bROM\b", "recorrido"),
        (r"\bspm\b", "paladas por minuto"),
    )
    for pattern, replacement in replacements:
        value = re.sub(pattern, replacement, value, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", value).strip()


def equipment_data(value: str, exercise_id: str) -> tuple[list[str], list[dict]]:
    normalized = value.casefold()
    tags: list[str] = []
    refs: list[dict] = []

    def add_tag(tag: str) -> None:
        if tag not in tags:
            tags.append(tag)

    def add_ref(kind: str, reference_id: str) -> None:
        item = {"kind": kind, "id": reference_id}
        if item not in refs:
            refs.append(item)

    if re.search(r"smartbell|mancuerna|\bdb\b", normalized):
        add_tag("Mancuernas"); add_ref("equipment", "smartbells-pro")
    if re.search(r"kettlebell|\bkb\b", normalized):
        add_tag("Pesa rusa"); add_ref("equipment", "pesa-rusa-ajustable")
    if re.search(r"banco|crunch/situp|chin-up|head extension", normalized):
        add_tag("Banco ajustable"); add_ref("equipment", "super-bench-pro-v2")
    if re.search(r"banda|\bband|barra larga|agarres|anclaje", normalized):
        add_tag("Bandas elásticas"); add_ref("equipment", "rogue-monster-bands")
    if exercise_id >= "E85" or "echo rower" in normalized:
        add_tag("Máquina de remo"); add_ref("equipment", "rogue-echo-rower")
    if "crunch/situp" in normalized:
        add_tag("Accesorio abdominal")
        add_ref("bench-accessory", "crunch-situp")
    if "chin-up" in normalized:
        add_tag("Barra de dominadas")
        add_ref("bench-accessory", "chin-up-attachment")
    if "asiento" in normalized:
        add_ref("bench-accessory", "asiento-inclinado")
    if "head extension" in normalized:
        add_ref("bench-accessory", "extension-cabeza")
    if "barra larga" in normalized:
        add_ref("band-accessory", "barra-larga")
    if "agarre" in normalized and "chin-up" not in normalized:
        add_ref("band-accessory", "agarres-individuales")
    if "anclaje alto" in normalized:
        add_ref("anchor", "anclaje-alto")
    if "anclaje lateral" in normalized or "anclaje posterior" in normalized:
        add_ref("anchor", "anclaje-lateral")
    if "anclaje bajo" in normalized:
        add_ref("anchor", "anclaje-bajo-variable")
    if "peso corporal" in normalized or "suelo" in normalized:
        add_tag("Peso corporal"); add_ref("support", "suelo")
    if not tags:
        add_tag("Peso corporal"); add_ref("support", "sin-equipamiento")
    if not any(tag in {"Mancuernas", "Pesa rusa", "Bandas elásticas"} for tag in tags):
        specific_first = {"Accesorio abdominal", "Barra de dominadas"}
        tags.sort(key=lambda tag: 0 if tag in specific_first else 1)
    return tags, refs


def walking_exercise() -> dict:
    return {
        "id": "e91",
        "sourceId": "E91",
        "name": "Caminata a ritmo sostenible",
        "shortName": "Caminata sostenible",
        "taxonomy": {
            "family": "Cardio",
            "primaryRegion": "Piernas",
            "patterns": MOVEMENT_PATTERNS["E91"],
            "primaryMuscles": ["Cuádriceps", "Glúteo mayor"],
            "supportingMuscles": ["Isquiotibiales", "Gemelos", "Sóleo", "Core anterior"],
            "equipment": ["Calzado cómodo"],
            "difficulty": "Básico",
        },
        "equipment": "Calzado cómodo y recorrido seguro",
        "equipmentRefs": [{"kind": "support", "id": "calzado"}],
        "dose": "20–60 min",
        "image": "public/exercise-images/caminata-ritmo-sostenible.webp",
        "cue": "Mantén el ritmo indicado por la rutina con una zancada natural y una intensidad que puedas sostener.",
        "steps": [
            "Elige un recorrido seguro y, si es posible, con terreno regular.",
            "Empieza de tres a cinco minutos a ritmo suave.",
            "Camina erguido, con hombros relajados y balanceo natural de los brazos.",
            "Ajusta el ritmo con la prueba del habla indicada por la rutina.",
            "Termina de tres a cinco minutos reduciendo el ritmo de forma gradual.",
        ],
        "safety": "Usa calzado cómodo, mantente atento al terreno y adapta el ritmo a la temperatura y a la visibilidad. Reduce el paso o detente ante dolor, mareo o una dificultad respiratoria inusual.",
        "documentedExecution": "1. Elegir un recorrido seguro. 2. Empezar de tres a cinco minutos a ritmo suave. 3. Caminar erguido con balanceo natural de los brazos. 4. Ajustar el ritmo con la prueba del habla indicada. 5. Reducir el ritmo gradualmente al terminar.",
        "documentedTechnique": "Mantener una zancada natural, apoyar el pie con control y evitar alargar el paso de forma forzada. El ritmo de la rutina se regula mediante la prueba del habla.",
    }


def extract(source: Path) -> list[dict]:
    detailed: dict[str, dict] = {}
    summaries: dict[str, dict] = {}
    for line in source.read_text(encoding="utf-8").splitlines():
        detail_match = DETAIL_ROW.match(line)
        if detail_match:
            cells = line[1:-1].split(" | ")
            if len(cells) != 4:
                raise ValueError(f"{detail_match.group(1)} no contiene cuatro columnas detalladas.")
            detailed[detail_match.group(1)] = {"name": detail_match.group(2).strip(), "cells": cells}
            continue
        summary_match = SUMMARY_ROW.match(line)
        if summary_match:
            exercise_id, short_name, pattern, equipment, level = [item.strip() for item in summary_match.groups()]
            summaries[exercise_id] = {"shortName": short_name, "pattern": pattern, "mainEquipment": equipment, "level": level}

    expected_ids = [f"E{number:02d}" for number in range(1, 91)]
    if list(detailed) != expected_ids or list(summaries) != expected_ids:
        raise ValueError("La fuente debe contener exactamente E01–E90, una vez en detalle y una vez en el resumen.")
    if set(ANATOMY) != set(expected_ids):
        raise ValueError("La taxonomía anatómica no cubre exactamente E01–E90.")
    if set(MOVEMENT_PATTERNS) != set([*expected_ids, "E91"]):
        raise ValueError("La taxonomía de patrones no cubre exactamente E01–E91.")
    if set(IMAGE_BY_ID) != set(expected_ids):
        raise ValueError("El catálogo visual debe cubrir exactamente E01–E90.")

    categories = {
        range(1, 25): "Empuje", range(25, 45): "Tirón", range(45, 56): "Piernas",
        range(56, 70): "Cadena posterior", range(70, 85): "Core e integración", range(85, 91): "Cardio",
    }
    exercises = []
    for exercise_id in expected_ids:
        number = int(exercise_id[1:])
        detail = detailed[exercise_id]
        summary = summaries[exercise_id]
        metadata = detail["cells"][1]
        execution = public_text(detail["cells"][2])
        technique = public_text(detail["cells"][3])
        equipment_prefix = re.split(r"\*\*Primarios?:\*\*|\*\*Primario:\*\*|\*\*Técnica", metadata, maxsplit=1)[0]
        documented_equipment_source = clean(equipment_prefix).rstrip(". ")
        if number >= 85:
            documented_equipment_source = "Rogue Echo Rower"
        tags, refs = equipment_data(f"{documented_equipment_source} {summary['mainEquipment']}", exercise_id)
        documented_equipment = public_text(documented_equipment_source)
        steps = [public_text(item).rstrip(". ") + "." for item in NUMBERED_STEP.split(execution) if public_text(item)]
        if not steps:
            steps = [execution]
        dose_matches = re.findall(r"\*\*([^*]*(?:×|min|bloques)[^*]*)\*\*", detail["cells"][3])
        dose = public_text(dose_matches[-1]).rstrip(". ") if dose_matches else "Según tolerancia y técnica"
        cue = technique.split(". ")[0].strip(" .") + "."
        category = next(label for number_range, label in categories.items() if number in number_range)
        anatomy_item = ANATOMY[exercise_id]
        primary_region = "Cuerpo completo" if number >= 77 else GROUPS_BY_MUSCLE[anatomy_item["primaryMuscles"][0]][0]
        exercises.append({
            "id": exercise_id.lower(),
            "sourceId": exercise_id,
            "name": public_text(detail["name"]),
            "shortName": public_text(summary["shortName"]),
            "taxonomy": {
                "family": category,
                "primaryRegion": primary_region,
                "patterns": MOVEMENT_PATTERNS[exercise_id],
                "primaryMuscles": anatomy_item["primaryMuscles"],
                "supportingMuscles": anatomy_item["secondaryMuscles"],
                "equipment": tags,
                "difficulty": summary["level"],
            },
            "equipment": documented_equipment,
            "equipmentRefs": refs,
            "dose": dose,
            "image": f"public/exercise-images/{IMAGE_BY_ID[exercise_id]}.webp" if exercise_id in IMAGE_BY_ID else None,
            "cue": cue,
            "steps": steps,
            "safety": technique,
            "documentedExecution": execution,
            "documentedTechnique": technique,
        })
    exercises.append(walking_exercise())
    return exercises


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Uso: import_exercise_library.py <biblioteca.md>")
    exercises = extract(Path(sys.argv[1]).resolve())
    payload = json.dumps(exercises, ensure_ascii=False, indent=2)
    print("/* Generado desde Biblioteca integral de ejercicios. No editar manualmente. */")
    print("(function (root) {")
    print('  "use strict";')
    print(f"  root.TrainingExercises = {payload};")
    print("})(typeof window !== \"undefined\" ? window : globalThis);")


if __name__ == "__main__":
    main()
