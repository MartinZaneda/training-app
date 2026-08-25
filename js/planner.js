(function (root, factory) {
  "use strict";
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TrainingPlanner = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";

  const MUSCLE_GROUPS = {
    "Cuerpo completo": ["Pectoral mayor", "Serrato anterior", "Deltoides anterior", "Deltoides lateral", "Deltoides posterior", "Manguito rotador", "Trapecio", "Tríceps braquial", "Bíceps braquial", "Braquial", "Braquiorradial", "Antebrazos", "Dorsal ancho", "Redondo mayor", "Romboides", "Erectores espinales", "Cuádriceps", "Gemelos", "Sóleo", "Aductores", "Glúteo mayor", "Glúteo medio", "Isquiotibiales", "Core anterior", "Oblicuos", "Cuadrado lumbar", "Flexores de cadera"],
    Piernas: ["Cuádriceps", "Gemelos", "Sóleo", "Glúteo mayor", "Aductores"],
    Pecho: ["Pectoral mayor", "Serrato anterior"],
    Espalda: ["Dorsal ancho", "Redondo mayor", "Romboides", "Trapecio", "Erectores espinales"],
    "Glúteos e isquios": ["Glúteo mayor", "Glúteo medio", "Isquiotibiales"],
    Core: ["Core anterior", "Oblicuos", "Cuadrado lumbar", "Erectores espinales", "Flexores de cadera"],
    Hombros: ["Deltoides anterior", "Deltoides lateral", "Deltoides posterior", "Manguito rotador", "Trapecio"],
    Brazos: ["Bíceps braquial", "Braquial", "Braquiorradial", "Tríceps braquial", "Antebrazos"],
    Aductores: ["Aductores"]
  };
  const EXERCISE_TAXONOMY_FIELDS = ["family", "primaryRegion", "patterns", "primaryMuscles", "supportingMuscles", "equipment", "difficulty"];
  const EXERCISE_FAMILIES = new Set(["Empuje", "Tirón", "Piernas", "Cadena posterior", "Core e integración", "Cardio"]);
  const EXERCISE_PRIMARY_REGIONS = new Set(["Pecho", "Espalda", "Hombros", "Brazos", "Piernas", "Glúteos e isquios", "Core", "Cuerpo completo"]);
  const EXERCISE_DIFFICULTIES = new Set(["Básico", "Básico–intermedio", "Intermedio", "Intermedio–avanzado", "Avanzado"]);
  const EXERCISE_PATTERNS = new Set(["Empuje horizontal", "Empuje inclinado", "Empuje vertical", "Apertura de pecho", "Extensión de hombro", "Elevación de hombro", "Extensión de codo", "Tirón vertical", "Control escapular", "Tirón horizontal", "Flexión de codo", "Sentadilla", "Zancada", "Flexión plantar", "Bisagra de cadera", "Extensión de cadera", "Potencia de tren inferior", "Potencia de cadera", "Flexión de tronco", "Elevación de piernas", "Antirrotación", "Antiflexión lateral", "Rotación de tronco", "Transporte de carga", "Estabilidad unilateral", "Estabilidad sobre cabeza", "Integración multiplanar", "Remo continuo", "Técnica de remo", "Intervalos de remo", "Potencia de remo", "Caminata"]);
  const EXERCISE_EQUIPMENT = new Set(["Mancuernas", "Pesa rusa", "Banco ajustable", "Bandas elásticas", "Máquina de remo", "Peso corporal", "Accesorio abdominal", "Barra de dominadas", "Calzado cómodo"]);
  const ROUTINE_FACETS = ["library", "objective", "type", "region", "equipment", "duration", "level", "pattern", "station", "format", "logistics", "complement"];
  const ROUTINE_FIELDS = { library: "library", objective: "objectives", type: "types", region: "regions", equipment: "equipment", duration: "durations", level: "level", pattern: "patterns", station: "stations", format: "formats", logistics: "logisticsChanges", complement: "complements" };
  const DURATION_LABELS = { XS: "Muy corta", S: "Corta", M: "Media", L: "Larga" };
  const FACET_LABELS = { library: "Tipo de rutina", objective: "Objetivo", type: "Tipo de intervalo", region: "Zona corporal", equipment: "Equipamiento", duration: "Duración", level: "Nivel", pattern: "Patrón de movimiento", station: "Montaje", format: "Formato de trabajo", logistics: "Cambios de montaje", complement: "Uso recomendado" };
  const FACET_VALUE_LABELS = {
    library: { general: "Rutinas generales", hiit: "Intervalos de alta intensidad" },
    type: {
      AER: "Intervalos aeróbicos",
      SIT: "Intervalos de velocidad",
      POWER: "Potencia por intervalos",
      HIFT: "Entrenamiento funcional de alta intensidad",
      "INT-CORE": "Intervalos para la zona media",
      MIX: "Entrenamiento mixto"
    },
    region: {
      pecho: "Pecho", hombro: "Hombros", "tríceps": "Tríceps", espalda: "Espalda", "bíceps": "Bíceps",
      piernas: "Piernas", inferior: "Tren inferior", posterior: "Cadena posterior", full: "Cuerpo completo",
      "glúteos": "Glúteos", core: "Zona media", superior: "Tren superior", "full-body": "Cuerpo completo",
      cardio: "Sistema cardiovascular", pull: "Tirón", push: "Empuje"
    },
    equipment: {
      DB: "Mancuernas ajustables", banco: "Banco", Crunch: "Accesorio abdominal", bandas: "Bandas elásticas",
      KB: "Pesa rusa ajustable", ChinUp: "Accesorio de dominadas", "barra-band": "Barra con bandas",
      Rower: "Máquina de remo", ROW: "Máquina de remo", "DB+B0": "Mancuernas y banco plano",
      "DB+BI": "Mancuernas y banco inclinado", "DB+BENCH": "Mancuernas y banco", "BAND-MED": "Bandas con anclaje medio",
      "BAND-HIGH": "Bandas con anclaje alto", "BAND-LOW": "Bandas con anclaje bajo", "BAND-FOOT": "Bandas bajo los pies",
      "BAND+BAR": "Bandas con barra", BAND: "Bandas elásticas", CU: "Accesorio de dominadas", BENCH: "Banco",
      CR: "Accesorio abdominal", "ROW+KB": "Máquina de remo y pesa rusa", "ROW+DB": "Máquina de remo y mancuernas",
      "ROW+BAND": "Máquina de remo y bandas", "ROW+CU": "Máquina de remo y accesorio de dominadas", calzado: "Calzado cómodo"
    },
    pattern: {
      "empuje-H": "Empuje horizontal", "empuje-diagonal": "Empuje diagonal", "empuje-V": "Empuje vertical",
      "tirón-V": "Tirón vertical", "tirón-H": "Tirón horizontal", squat: "Sentadilla", lunge: "Zancada",
      unilateral: "Trabajo unilateral", hinge: "Bisagra de cadera", "extensión-cadera": "Extensión de cadera",
      "flexión": "Flexión del tronco", "anti-rotación": "Resistencia a la rotación", "rotación": "Rotación",
      carry: "Paseo con carga", push: "Empuje", pull: "Tirón", remo: "Remo", caminar: "Caminar", mixto: "Patrones combinados"
    },
    station: {
      DB0: "Mancuernas con banco plano", DBI: "Mancuernas con banco inclinado", "B-MED": "Bandas con anclaje medio",
      "B-BAJA": "Bandas con anclaje bajo", "B-ALTA": "Bandas con anclaje alto", "ATT-CU": "Accesorio de dominadas",
      KB: "Pesa rusa", "ATT-CR": "Accesorio abdominal", ROW: "Máquina de remo"
    },
    format: {
      series: "Series tradicionales", potencia: "Trabajo de potencia", continuo: "Trabajo continuo", "técnica": "Práctica técnica",
      tempo: "Ritmo sostenido", intervalos: "Trabajo por intervalos", sprint: "Aceleraciones intensas", "4MIN": "Bloques de cuatro minutos",
      DIST: "Repeticiones por distancia", WAVE: "Intervalos en onda", REPS: "Rondas por repeticiones", EMOM: "Una serie al inicio de cada minuto",
      BLOCK: "Trabajo por bloques", "45-30": "Intervalos de cuarenta y cinco y treinta segundos"
    },
    complement: { SOLO: "Sesión independiente", "POST-UP": "Después de entrenar el tren superior", FIN: "Finalizador de otra sesión" }
  };
  const LEGACY_PROFILE_ALIASES = { marta: "personal", carlos: "personal", alba: "personal" };

  function unique(items) { return [...new Set(items.filter((item) => item !== null && item !== undefined && item !== ""))]; }
  function normalizedSearchText(value) { return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es"); }

  function inventoryReferenceSets(inventory) {
    return {
      equipment: new Set((inventory?.equipment || []).map((item) => item.id)),
      "bench-accessory": new Set((inventory?.equipment || []).flatMap((item) => item.accessories || []).map((item) => item.id)),
      "band-accessory": new Set((inventory?.equipmentAccessories || []).map((item) => item.id)),
      anchor: new Set((inventory?.bandAnchors || []).map((item) => item.id)),
      support: new Set(Object.keys(inventory?.supports || {}))
    };
  }

  function inventoryRecords(inventory) {
    return [
      ...(inventory?.equipment || []).flatMap((item) => [
        { ...item, kind: "equipment" },
        ...(item.accessories || []).map((accessory) => ({ ...accessory, kind: "bench-accessory", parentId: accessory.parentId || item.id }))
      ]),
      ...(inventory?.equipmentAccessories || []).map((item) => ({ ...item, kind: "band-accessory" })),
      ...(inventory?.bandAnchors || []).map((item) => ({ ...item, kind: "anchor" })),
      ...Object.values(inventory?.supports || {}).map((item) => ({ ...item, kind: "support" }))
    ];
  }

  function validateInventoryMetadata(inventory) {
    const errors = [];
    const modalityDefinitions = new Map();
    const requireText = (item, fields, context) => {
      for (const field of fields) if (!String(item?.[field] || "").trim()) errors.push(`${context}: falta ${field}.`);
    };
    const registerModality = (selection, context) => {
      const signature = JSON.stringify(selection || {});
      if (modalityDefinitions.has(selection?.modality) && modalityDefinitions.get(selection.modality) !== signature) errors.push(`${context}: modalidad duplicada con una definición incoherente.`);
      else if (selection?.modality) modalityDefinitions.set(selection.modality, signature);
    };
    for (const item of inventory?.equipment || []) {
      requireText(item, ["id", "name", "category", "detail", "description", "image", "imageAlt", "note"], item?.id || "Equipamiento");
      if (!Array.isArray(item.routineTaxonomy) || !item.routineTaxonomy.length) errors.push(`${item.id}: sin taxonomía de rutinas.`);
      if (!Number.isInteger(item.quantity) || item.quantity < 1) errors.push(`${item.id}: cantidad no válida.`);
      if (item.selection) {
        requireText(item.selection, ["modality", "type", "label"], `${item.id}.selection`);
        registerModality(item.selection, item.id);
        if (!["load", "band", "damper", "fixed"].includes(item.selection.type)) errors.push(`${item.id}: tipo de selección no válido.`);
        if (["load", "damper"].includes(item.selection.type) && (!Array.isArray(item.variants) || !item.variants.length)) errors.push(`${item.id}: selección sin variantes.`);
        if (["load", "band", "damper"].includes(item.selection.type)) requireText(item.selection, ["fieldLabel", "seriesFieldLabel"], `${item.id}.selection`);
        if (item.selection.type === "load") {
          requireText(item.selection, ["summaryUnit"], `${item.id}.selection`);
          requireText(item, ["unit"], item.id);
        }
        if (item.selection.type === "damper") requireText(item.selection, ["help"], `${item.id}.selection`);
        if (item.selection.type === "fixed") requireText(item.selection, ["seriesFieldLabel", "staticValue"], `${item.id}.selection`);
      }
      for (const accessory of item.accessories || []) {
        requireText(accessory, ["id", "parentId", "name", "category", "detail", "image", "imageAlt"], accessory?.id || `${item.id}.accessory`);
        if (accessory.parentId !== item.id) errors.push(`${accessory.id}: equipo principal incoherente.`);
        if (accessory.selection) {
          requireText(accessory.selection, ["modality", "type", "label", "seriesFieldLabel", "staticValue"], `${accessory.id}.selection`);
          if (accessory.selection.type !== "fixed") errors.push(`${accessory.id}: el accesorio debe usar una selección fija.`);
          registerModality(accessory.selection, accessory.id);
        }
      }
    }
    for (const item of inventory?.equipmentAccessories || []) requireText(item, ["id", "name", "category", "detail", "description", "image", "imageAlt", "note", "parentId"], item?.id || "Accesorio de bandas");
    for (const item of inventory?.bandAnchors || []) requireText(item, ["id", "parentId", "position", "name", "detail", "icon", "note", "parentName"], item?.id || "Anclaje");
    for (const [id, item] of Object.entries(inventory?.supports || {})) {
      requireText(item, ["id", "name", "category", "detail", "description", "icon", "note"], id);
      if (item.id !== id) errors.push(`${id}: identificador de apoyo incoherente.`);
      requireText(item.selection, ["modality", "type", "label", "seriesFieldLabel", "staticValue"], `${id}.selection`);
      if (!["bodyweight", "walking"].includes(item.selection?.type)) errors.push(`${id}: tipo de selección de apoyo no válido.`);
      registerModality(item.selection, id);
    }
    for (const band of inventory?.bands || []) {
      requireText(band, ["id", "color", "kgf", "swatch"], band?.id || "Banda");
      if (!Number.isInteger(band.quantity) || band.quantity < 1 || !Number.isFinite(Number(band.pounds))) errors.push(`${band.id}: valores no válidos.`);
    }
    requireText(inventory?.bandMounting, ["title", "summary", "intro", "guidanceTitle", "guidance"], "Montaje de bandas");
    if (!Array.isArray(inventory?.effortLevels) || inventory.effortLevels.length !== 3) errors.push("Deben existir tres niveles de esfuerzo.");
    for (const level of inventory?.effortLevels || []) requireText(level, ["id", "label", "action", "advice", "icon"], level?.id || "Nivel de esfuerzo");
    return { valid: errors.length === 0, errors };
  }

  function validateExerciseMetadata(exercises, inventory = null) {
    const errors = [];
    const ids = new Set();
    const sourceIds = new Set();
    const referenceSets = inventory ? inventoryReferenceSets(inventory) : null;
    const selectableReferences = inventory ? new Set(inventoryRecords(inventory).filter((item) => item.selection).map((item) => `${item.kind}:${item.id}`)) : null;
    for (const exercise of exercises || []) {
      if (!exercise?.id || ids.has(exercise.id)) errors.push(`${exercise?.sourceId || "Ejercicio"}: id ausente o duplicado.`);
      if (!/^E\d{2}$/.test(exercise?.sourceId || "") || sourceIds.has(exercise.sourceId)) errors.push(`${exercise?.id || "Ejercicio"}: sourceId ausente o duplicado.`);
      ids.add(exercise?.id);
      sourceIds.add(exercise?.sourceId);
      const taxonomy = exercise?.taxonomy;
      const taxonomyFields = Object.keys(taxonomy || {}).sort();
      if (!taxonomy || JSON.stringify(taxonomyFields) !== JSON.stringify([...EXERCISE_TAXONOMY_FIELDS].sort())) errors.push(`${exercise?.sourceId}: estructura taxonómica incompleta o desconocida.`);
      if (!EXERCISE_FAMILIES.has(taxonomy?.family)) errors.push(`${exercise?.sourceId}: familia de movimiento no válida.`);
      if (!EXERCISE_PRIMARY_REGIONS.has(taxonomy?.primaryRegion)) errors.push(`${exercise?.sourceId}: zona corporal principal no válida.`);
      if (!EXERCISE_DIFFICULTIES.has(taxonomy?.difficulty)) errors.push(`${exercise?.sourceId}: dificultad no válida.`);
      for (const [field, allowedValues] of [["patterns", EXERCISE_PATTERNS], ["equipment", EXERCISE_EQUIPMENT]]) {
        const values = taxonomy?.[field];
        if (!Array.isArray(values) || !values.length || unique(values).length !== values.length || values.some((value) => !allowedValues.has(value))) errors.push(`${exercise?.sourceId}: ${field} contiene etiquetas ausentes, duplicadas o no canónicas.`);
      }
      const primaryMuscles = taxonomy?.primaryMuscles;
      const supportingMuscles = taxonomy?.supportingMuscles;
      const knownMuscles = new Set(MUSCLE_GROUPS["Cuerpo completo"]);
      if (!Array.isArray(primaryMuscles) || !primaryMuscles.length || unique(primaryMuscles).length !== primaryMuscles.length || primaryMuscles.some((muscle) => !knownMuscles.has(muscle))) errors.push(`${exercise?.sourceId}: músculos principales ausentes, duplicados o no canónicos.`);
      if (!Array.isArray(supportingMuscles) || unique(supportingMuscles || []).length !== supportingMuscles?.length || supportingMuscles?.some((muscle) => !knownMuscles.has(muscle) || primaryMuscles?.includes(muscle))) errors.push(`${exercise?.sourceId}: músculos de apoyo duplicados, desconocidos o clasificados también como principales.`);
      const tagValues = [taxonomy?.family, taxonomy?.primaryRegion, ...(Array.isArray(taxonomy?.patterns) ? taxonomy.patterns : []), ...(Array.isArray(primaryMuscles) ? primaryMuscles : []), ...(Array.isArray(supportingMuscles) ? supportingMuscles : []), ...(Array.isArray(taxonomy?.equipment) ? taxonomy.equipment : []), taxonomy?.difficulty];
      if (tagValues.some((tag) => typeof tag !== "string" || tag !== tag.trim() || tag.length > 28 || tag.includes(":"))) errors.push(`${exercise?.sourceId}: existe una etiqueta larga, compuesta o mal espaciada.`);
      if (taxonomy?.primaryRegion !== "Cuerpo completo" && primaryMuscles?.every((muscle) => !MUSCLE_GROUPS[taxonomy.primaryRegion].includes(muscle))) errors.push(`${exercise?.sourceId}: la zona principal no coincide con ningún músculo principal.`);
      if (!Array.isArray(exercise?.equipmentRefs) || !exercise.equipmentRefs.length) errors.push(`${exercise?.sourceId}: sin referencias de material.`);
      if (selectableReferences && !exercise?.equipmentRefs?.some((reference) => selectableReferences.has(`${reference.kind}:${reference.id}`))) errors.push(`${exercise?.sourceId}: sin configuración de registro vinculada al inventario.`);
      for (const reference of exercise?.equipmentRefs || []) {
        if (referenceSets && (!referenceSets[reference.kind] || !referenceSets[reference.kind].has(reference.id))) errors.push(`${exercise.sourceId}: referencia de material inexistente ${reference.kind}:${reference.id}.`);
      }
    }
    return { valid: errors.length === 0, errors };
  }

  function compileRoutineEquipmentReferences(blueprint, exerciseBySourceId, inventory) {
    const taxonomyValues = unique([...(blueprint?.equipment || []), ...(blueprint?.stations || [])]).map(normalizedSearchText);
    const taxonomyMatches = (item) => (item?.routineTaxonomy || []).some((term) => {
      const normalizedTerm = normalizedSearchText(term);
      return taxonomyValues.some((value) => value === normalizedTerm || value.split("+").includes(normalizedTerm));
    });
    const records = inventoryRecords(inventory);
    const recordByReference = new Map(records.map((item) => [`${item.kind}:${item.id}`, item]));
    const equipmentById = new Map((inventory?.equipment || []).map((item) => [item.id, item]));
    const references = [];
    const add = (kind, id) => {
      if (!references.some((reference) => reference.kind === kind && reference.id === id)) references.push({ kind, id });
    };
    const addRecord = (record) => {
      if (!record) return;
      if (record.parentId && equipmentById.has(record.parentId)) add("equipment", record.parentId);
      add(record.kind, record.id);
    };
    records.filter(taxonomyMatches).forEach(addRecord);
    const availableEquipmentIds = () => new Set(references.filter((reference) => reference.kind === "equipment").map((reference) => reference.id));
    for (const sourceId of blueprint?.exerciseSourceIds || []) {
      for (const reference of exerciseBySourceId.get(sourceId)?.equipmentRefs || []) {
        const record = recordByReference.get(`${reference.kind}:${reference.id}`);
        if (!record) continue;
        if (reference.kind === "support") addRecord(record);
        else if (record.parentId && availableEquipmentIds().has(record.parentId)) addRecord(record);
      }
    }
    return references;
  }

  function compileRoutineCatalog(exercises, inventory = root.TrainingData, generalBlueprints = root.TrainingRoutineBlueprints, hiitBlueprints = root.TrainingHiitRoutineBlueprints) {
    const exerciseBySourceId = new Map((exercises || []).map((exercise) => [exercise.sourceId, exercise]));
    const sessionModel = root.TrainingSessionModel;
    if (!sessionModel) throw new Error("El modelo canónico de sesiones no se ha cargado.");
    if (!Array.isArray(generalBlueprints) || generalBlueprints.length !== 49) throw new Error("La biblioteca de rutinas R01–R49 no se ha cargado.");
    if (!Array.isArray(hiitBlueprints) || hiitBlueprints.length !== 48) throw new Error("La biblioteca HIIT H01–H48 no se ha cargado.");
    const blueprints = [...generalBlueprints, ...hiitBlueprints];
    return Object.fromEntries(blueprints.map((blueprint) => {
      const protocol = sessionModel.compileProtocol(blueprint.id, exerciseBySourceId);
      const exerciseSourceIds = protocol?.exerciseSourceIds || unique(blueprint.exerciseSourceIds || blueprint.items.map((item) => item.exerciseSourceId));
      const items = blueprint.items.map((item) => {
        if (item.kind === "protocol") return { kind: "protocol", prescription: item.prescription, instruction: item.instruction, optional: Boolean(item.optional) };
        const exercise = exerciseBySourceId.get(item.exerciseSourceId);
        if (!exercise) throw new Error(`${blueprint.id}: ${item.exerciseSourceId} no existe en la biblioteca E01–E91.`);
        return {
          kind: "exercise",
          exerciseId: exercise.id,
          sourceId: exercise.sourceId,
          prescription: item.prescription,
          instruction: item.instruction,
          optional: Boolean(item.optional),
          rest: sessionModel.restFor(blueprint.id, exercise.sourceId, item.prescription)
        };
      });
      const exerciseIds = exerciseSourceIds.map((sourceId) => {
        const exercise = exerciseBySourceId.get(sourceId);
        if (!exercise) throw new Error(`${blueprint.id}: ${sourceId} no existe en la biblioteca E01–E91.`);
        return exercise.id;
      });
      const kind = blueprint.library === "hiit" ? "hiit" : blueprint.regions.length === 1 && blueprint.regions[0] === "cardio" ? "cardio" : blueprint.regions.includes("cardio") ? "híbrida" : "fuerza";
      const equipmentRefs = compileRoutineEquipmentReferences({ ...blueprint, exerciseSourceIds }, exerciseBySourceId, inventory);
      const duration = protocol ? sessionModel.protocolDuration(protocol) : sessionModel.durationOverride(blueprint.id) || {};
      const protocolPresentation = protocol ? {
        warmupCue: protocol.warmupCue,
        cooldownCue: protocol.cooldownCue,
        phaseGuidance: protocol.phaseGuidance
      } : {};
      return [blueprint.id, { ...blueprint, ...duration, ...protocolPresentation, kind, protocol, exerciseSourceIds, exerciseIds, equipmentRefs, items }];
    }));
  }

  function buildRoutineCatalog(exercises, inventory = root.TrainingData) { return compileRoutineCatalog(exercises, inventory); }

  function coverageFor(exercises, routines) {
    const appearances = Object.fromEntries((exercises || []).map((exercise) => [exercise.id, 0]));
    Object.values(routines || {}).forEach((routine) => routine.exerciseIds.forEach((id) => { appearances[id] = (appearances[id] || 0) + 1; }));
    const covered = Object.keys(appearances).filter((id) => appearances[id] > 0);
    const uncovered = Object.keys(appearances).filter((id) => appearances[id] === 0);
    return { appearances, covered, uncovered };
  }

  function validateRoutineCatalog(exercises, routines, inventory = null) {
    const errors = [];
    const exerciseIds = new Set((exercises || []).map((exercise) => exercise.id));
    const referenceSets = inventory ? inventoryReferenceSets(inventory) : null;
    const expectedIds = [
      ...Array.from({ length: 49 }, (_, index) => `R${String(index + 1).padStart(2, "0")}`),
      ...Array.from({ length: 48 }, (_, index) => `H${String(index + 1).padStart(2, "0")}`)
    ];
    const ids = Object.keys(routines || {});
    if (ids.length !== 97) errors.push(`Se esperaban 97 rutinas y hay ${ids.length}.`);
    if (ids.join("|") !== expectedIds.join("|")) errors.push("Los identificadores internos deben ser exactamente R01–R49 seguidos de H01–H48.");
    for (const routine of Object.values(routines || {})) {
      if (!routine.title || !routine.section || !routine.description || !routine.sequence || !routine.tagsRaw) errors.push(`${routine.id}: faltan textos documentales.`);
      if (!routine.items.length) errors.push(`${routine.id}: no contiene ejercicios o protocolos.`);
      if (!routine.regions.length || !routine.equipment.length || !routine.durations.length || !routine.level) errors.push(`${routine.id}: taxonomía incompleta.`);
      if (routine.library === "general" && !routine.objectives.length) errors.push(`${routine.id}: rutina general sin OBJ.`);
      if (routine.library === "hiit" && !routine.types.length) errors.push(`${routine.id}: rutina HIIT sin TIPO.`);
      const requiresProtocol = routine.library === "hiit" || /^R(?:3[8-9]|4[0-3]|4[7-9])$/.test(routine.id);
      if (requiresProtocol && !routine.protocol) errors.push(`${routine.id}: protocolo de ejecución ausente.`);
      if (routine.protocol && (!routine.warmupCue || !routine.cooldownCue || !routine.phaseGuidance?.work || !routine.phaseGuidance?.recovery || !routine.phaseGuidance?.transition)) errors.push(`${routine.id}: indicaciones de fases incompletas.`);
      if (!routine.durationRange || routine.durationRange.length !== 2 || !routine.estimatedMinutes) errors.push(`${routine.id}: duración no válida.`);
      if (routine.durationBasis !== "session") errors.push(`${routine.id}: la duración pública debe representar la sesión completa.`);
      if (routine.protocol) {
        const variantIds = routine.protocol.variants.map((variant) => variant.id);
        if (!variantIds.length || new Set(variantIds).size !== variantIds.length || !variantIds.includes(routine.protocol.defaultVariantId)) errors.push(`${routine.id}: variantes de protocolo no válidas.`);
        for (const variant of routine.protocol.variants) {
          if (!variant.id || !variant.label || !variant.segments.length || !Number.isFinite(variant.warmupSeconds) || variant.warmupSeconds < 0 || !Number.isFinite(variant.cooldownSeconds) || variant.cooldownSeconds < 0 || variant.metrics.totalSeconds <= 0 || variant.metrics.totalSeconds > 3 * 60 * 60) errors.push(`${routine.id}/${variant.id}: variante incompleta.`);
          if (variant.metrics.totalSeconds !== variant.metrics.warmupSeconds + variant.metrics.mainSeconds + variant.metrics.cooldownSeconds) errors.push(`${routine.id}/${variant.id}: suma temporal inconsistente.`);
          for (const segment of variant.segments) {
            const segmentSeconds = segment.durationSeconds ?? segment.estimatedSeconds;
            if (!["work", "recovery", "transition"].includes(segment.kind) || !Number.isFinite(segmentSeconds) || segmentSeconds <= 0 || !Number.isFinite(segment.activeSeconds) || segment.activeSeconds < 0 || segment.activeSeconds > segmentSeconds) errors.push(`${routine.id}/${variant.id}: segmento temporal no válido.`);
            if (!segment.label || !segment.guidance || segment.guidance.length > 120 || segment.guidance.includes("\n")) errors.push(`${routine.id}/${variant.id}: indicación de segmento no válida.`);
            if (segment.kind === "work" && !segment.exerciseSourceId) errors.push(`${routine.id}/${variant.id}: esfuerzo sin ejercicio asociado.`);
            if (segment.exerciseSourceId && !Number.isInteger(segment.movementIndex)) errors.push(`${routine.id}/${variant.id}: ejercicio de segmento no resuelto.`);
          }
        }
      }
      if (!Array.isArray(routine.equipmentRefs) || !routine.equipmentRefs.length) errors.push(`${routine.id}: sin referencias normalizadas de equipamiento.`);
      for (const reference of routine.equipmentRefs || []) {
        if (referenceSets && (!referenceSets[reference.kind] || !referenceSets[reference.kind].has(reference.id))) errors.push(`${routine.id}: referencia de material inexistente ${reference.kind}:${reference.id}.`);
      }
      for (const item of routine.items) {
        if (item.kind === "exercise" && !exerciseIds.has(item.exerciseId)) errors.push(`${routine.id}: referencia inexistente ${item.exerciseId}.`);
        if (item.kind === "exercise" && !/^E\d{2}$/.test(item.sourceId)) errors.push(`${routine.id}: posición sin referencia documental.`);
        if (item.kind === "exercise" && (!item.rest || !Number.isFinite(item.rest.defaultSeconds) || item.rest.minimumSeconds > item.rest.defaultSeconds || item.rest.defaultSeconds > item.rest.maximumSeconds)) errors.push(`${routine.id}/${item.sourceId}: descanso explícito no válido.`);
        if (!item.prescription || !["exercise", "protocol"].includes(item.kind)) errors.push(`${routine.id}: posición sin prescripción documental.`);
      }
      if (routine.exerciseIds.some((id) => !exerciseIds.has(id))) errors.push(`${routine.id}: contiene referencias E inexistentes.`);
    }
    const coverage = coverageFor(exercises, routines);
    if (coverage.uncovered.length) errors.push(`Ejercicios sin cobertura: ${coverage.uncovered.join(", ")}.`);
    return { valid: errors.length === 0, errors, coverage };
  }

  function sessionFor(routine) {
    return {
      routineId: routine.id,
      durationLabel: routine.durationLabel,
      durationRange: [...routine.durationRange],
      estimatedMinutes: routine.estimatedMinutes,
      plannedSeconds: routine.plannedSeconds || routine.estimatedMinutes * 60,
      durationBreakdown: routine.durationBreakdown ? { ...routine.durationBreakdown } : null,
      protocol: routine.protocol,
      items: routine.items.map((item) => ({ ...item }))
    };
  }

  function buildSessionSteps(session) {
    return (session?.items || []).map((item, index) => ({ kind: item.kind, index, exerciseId: item.exerciseId, sourceId: item.sourceId, target: item.prescription, instruction: item.instruction, optional: item.optional }));
  }

  function scheduleMetrics(schedule, routines) {
    const selected = (schedule || []).map((id) => routines?.[id]).filter(Boolean);
    return {
      planned: selected.length,
      strength: selected.filter((routine) => routine.kind === "fuerza").length,
      cardio: selected.filter((routine) => routine.kind === "cardio").length,
      hybrid: selected.filter((routine) => routine.kind === "híbrida").length,
      hiit: selected.filter((routine) => routine.kind === "hiit").length,
      minutes: selected.reduce((sum, routine) => sum + routine.estimatedMinutes, 0)
    };
  }

  function validateWeeklyPresets(presets, routines) {
    const errors = [];
    const ids = new Set();
    const validRoutineIds = new Set(Object.keys(routines || {}));
    if (!Array.isArray(presets) || presets.length !== 3) return { valid: false, errors: ["Deben existir exactamente tres planes semanales predefinidos."] };
    for (const preset of presets) {
      if (!preset?.id || ids.has(preset.id)) errors.push("Cada plan semanal necesita un identificador interno único.");
      ids.add(preset?.id);
      if (!preset?.title || !preset?.description || !preset?.summary || !preset?.icon) errors.push(`${preset?.title || "Plan semanal"}: faltan textos de presentación.`);
      if (!Array.isArray(preset?.schedule) || preset.schedule.length !== 7) {
        errors.push(`${preset?.title || "Plan semanal"}: la distribución debe cubrir los siete días.`);
        continue;
      }
      for (const routineId of preset.schedule) {
        if (routineId !== null && !validRoutineIds.has(routineId)) errors.push(`${preset.title}: contiene una rutina inexistente.`);
      }
      if (!preset.schedule.some(Boolean)) errors.push(`${preset.title}: no contiene ninguna sesión.`);
    }
    return { valid: errors.length === 0, errors };
  }

  function exerciseMatchesFilters(exercise, filters = {}, ignoredFacet = null) {
    const query = normalizedSearchText(filters.query).trim();
    const taxonomy = exercise?.taxonomy || {};
    const searchable = [exercise.sourceId, exercise.name, exercise.shortName, taxonomy.family, taxonomy.primaryRegion, ...(taxonomy.patterns || []), ...(taxonomy.primaryMuscles || []), ...(taxonomy.supportingMuscles || []), ...(taxonomy.equipment || []), exercise.equipment, taxonomy.difficulty];
    return (!query || searchable.some((value) => normalizedSearchText(value).includes(query)))
      && (ignoredFacet === "region" || !filters.region || taxonomy.primaryRegion === filters.region)
      && (ignoredFacet === "primaryMuscle" || !filters.primaryMuscle || taxonomy.primaryMuscles?.includes(filters.primaryMuscle))
      && (ignoredFacet === "movement" || !filters.movement || taxonomy.patterns?.includes(filters.movement))
      && (ignoredFacet === "equipment" || !filters.equipment || taxonomy.equipment?.includes(filters.equipment))
      && (ignoredFacet === "difficulty" || !filters.difficulty || taxonomy.difficulty === filters.difficulty);
  }

  function exerciseFilterFacets(exercises, filters = {}) {
    const list = Array.isArray(exercises) ? exercises : [];
    const regionMuscles = filters.region && MUSCLE_GROUPS[filters.region] ? new Set(MUSCLE_GROUPS[filters.region]) : null;
    const selectedPrimaryMuscle = filters.primaryMuscle && regionMuscles?.has(filters.primaryMuscle) ? filters.primaryMuscle : null;
    const effectiveFilters = { ...filters, primaryMuscle: selectedPrimaryMuscle };
    const valuesFor = (facet) => {
      if (facet === "primaryMuscle") return regionMuscles ? unique(list.flatMap((exercise) => exercise.taxonomy.primaryRegion === filters.region ? exercise.taxonomy.primaryMuscles.filter((muscle) => regionMuscles.has(muscle)) : [])) : [];
      return unique(list.flatMap((exercise) => facet === "region" ? [exercise.taxonomy.primaryRegion] : facet === "movement" ? exercise.taxonomy.patterns : facet === "equipment" ? exercise.taxonomy.equipment : [exercise.taxonomy.difficulty]));
    };
    const facetOptions = (facet) => {
      const pool = list.filter((exercise) => exerciseMatchesFilters(exercise, effectiveFilters, facet));
      return valuesFor(facet).map((value) => ({ value, count: pool.filter((exercise) => facet === "region" ? exercise.taxonomy.primaryRegion === value : facet === "primaryMuscle" ? exercise.taxonomy.primaryMuscles.includes(value) : facet === "movement" ? exercise.taxonomy.patterns.includes(value) : facet === "equipment" ? exercise.taxonomy.equipment.includes(value) : exercise.taxonomy.difficulty === value).length })).filter((item) => item.count > 0);
    };
    const facetNames = ["region", "primaryMuscle", "movement", "equipment", "difficulty"];
    return { options: list.filter((exercise) => exerciseMatchesFilters(exercise, effectiveFilters)), facets: Object.fromEntries(facetNames.map((facet) => [facet, facetOptions(facet)])), selectedPrimaryMuscle };
  }

  function routineHas(routine, facet, value) {
    const field = ROUTINE_FIELDS[facet];
    return Array.isArray(routine[field]) ? routine[field].includes(value) : routine[field] === value;
  }

  function routineMatchesFilters(routine, filters = {}, ignoredFacet = null) {
    const query = normalizedSearchText(filters.query).trim();
    const searchable = [
      routine.searchLabel,
      routine.title,
      routine.shortName,
      routine.description,
      routine.section,
      ...ROUTINE_FACETS.flatMap((facet) => {
        const field = ROUTINE_FIELDS[facet];
        const values = Array.isArray(routine[field]) ? routine[field] : [routine[field]];
        return values.flatMap((value) => [value, routineFacetLabel(facet, value)]);
      })
    ];
    return (!query || searchable.some((value) => normalizedSearchText(value).includes(query)))
      && ROUTINE_FACETS.every((facet) => facet === ignoredFacet || !filters[facet] || routineHas(routine, facet, filters[facet]));
  }

  function routineFilterFacets(routines, filters = {}) {
    const list = Array.isArray(routines) ? routines : Object.values(routines || {});
    const validFilters = {};
    for (const facet of ROUTINE_FACETS) {
      const field = ROUTINE_FIELDS[facet];
      const available = unique(list.flatMap((routine) => Array.isArray(routine[field]) ? routine[field] : [routine[field]]));
      validFilters[facet] = available.includes(filters[facet]) ? filters[facet] : null;
    }
    const effectiveFilters = { ...validFilters, query: filters.query };
    const facets = Object.fromEntries(ROUTINE_FACETS.map((facet) => {
      const pool = list.filter((routine) => routineMatchesFilters(routine, effectiveFilters, facet));
      const field = ROUTINE_FIELDS[facet];
      const values = unique(list.flatMap((routine) => Array.isArray(routine[field]) ? routine[field] : [routine[field]]));
      return [facet, values.map((value) => ({ value, count: pool.filter((routine) => routineHas(routine, facet, value)).length })).filter((option) => option.count > 0)];
    }));
    return { options: list.filter((routine) => routineMatchesFilters(routine, effectiveFilters)), facets, selected: validFilters };
  }

  function routineFacetLabel(facet, value) {
    if (facet === "duration") return DURATION_LABELS[value] || value;
    if (facet === "logistics") return `${value} ${Number(value) === 1 ? "cambio" : "cambios"}`;
    if (facet === "format" && /^\d+:\d+$/.test(String(value))) {
      const [work, recovery] = String(value).split(":");
      return `${work} segundos de trabajo y ${recovery} de recuperación`;
    }
    const mapped = FACET_VALUE_LABELS[facet]?.[value];
    if (mapped) return mapped;
    const label = String(value).replaceAll("-", " ");
    return label.charAt(0).toLocaleUpperCase("es") + label.slice(1);
  }

  function validLocalDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }

  function migrateState(input, routines = {}, inventory = {}) {
    const state = input && typeof input === "object" ? JSON.parse(JSON.stringify(input)) : {};
    const validIds = new Set(Object.keys(routines || {}));
    const validId = (id) => typeof id === "string" && validIds.has(id) ? id : null;
    const previousProfile = state.activeProfile;
    const entries = Object.entries(state.schedules || {});
    const preferred = entries.find(([profileId]) => profileId === previousProfile) || entries[0];
    const schedules = preferred && Array.isArray(preferred[1]) ? { personal: Array.from({ length: 7 }, (_, day) => validId(preferred[1][day])) } : {};
    const completionsBySession = new Map();
    const validExerciseIds = new Set(Object.values(routines || {}).flatMap((routine) => routine.exerciseIds || []));
    const finiteClamped = (value, minimum, maximum, fallback = 0) => {
      const number = Number(value);
      return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
    };
    const sanitizeSelection = (selection) => {
      if (!selection || typeof selection !== "object") return null;
      const modalities = new Set(inventoryRecords(inventory).map((item) => item.selection?.modality).filter(Boolean));
      if (!modalities.has(selection.modality)) return null;
      return {
        modality: selection.modality,
        loadKg: selection.loadKg === null ? null : finiteClamped(selection.loadKg, 0, 200, null),
        bandId: typeof selection.bandId === "string" ? selection.bandId.slice(0, 80) : null,
        bandCount: Math.round(finiteClamped(selection.bandCount, 1, 2, 1)),
        damper: selection.damper === null ? null : Math.round(finiteClamped(selection.damper, 1, 10, null))
      };
    };
    const sanitizePerformance = (performance) => (Array.isArray(performance) ? performance : []).slice(0, 100).flatMap((entry) => {
      if (!entry || !validExerciseIds.has(entry.exerciseId)) return [];
      const selection = sanitizeSelection(entry.selection);
      const effort = ["easy", "normal", "hard"].includes(entry.effort) ? entry.effort : null;
      const sets = (Array.isArray(entry.sets) ? entry.sets : []).slice(0, 100).map((set) => ({
        number: Math.round(finiteClamped(set?.number, 1, 100, 1)),
        reps: set?.reps === null ? null : Math.round(finiteClamped(set?.reps, 0, 999)),
        durationSeconds: Math.round(finiteClamped(set?.durationSeconds, 0, 86400)),
        repetitionsInReserve: set?.repetitionsInReserve === null || set?.repetitionsInReserve === undefined ? null : Math.round(finiteClamped(set.repetitionsInReserve, 0, 10, 0)),
        completed: set?.completed === true,
        skipped: set?.skipped === true,
        selection: sanitizeSelection(set?.selection) || selection
      }));
      return [{
        exerciseId: entry.exerciseId,
        prescription: String(entry.prescription || "").slice(0, 1200),
        notes: String(entry.notes || "").slice(0, 500),
        effort,
        selection,
        sets
      }];
    });
    for (const [index, item] of (Array.isArray(state.completions) ? state.completions : []).entries()) {
      if (!item || typeof item !== "object") continue;
      const routineId = validId(item.routineId);
      if (!routineId || !validLocalDate(item.date)) continue;
      const routine = routines[routineId];
      const rawDuration = Number(item.duration);
      const rawExercises = Number(item.exercises);
      const duration = Number.isFinite(rawDuration) && rawDuration > 0 && rawDuration <= 1440 ? Math.round(rawDuration) : routine.estimatedMinutes;
      const exercises = Number.isFinite(rawExercises) && rawExercises >= 0
        ? Math.min(Math.round(rawExercises), Math.max(routine.items.length, routine.exerciseIds?.length || 0))
        : Math.max(routine.items.length, routine.exerciseIds?.length || 0);
      const protocolVariant = routine.protocol?.variants.find((variant) => variant.id === item.protocolVariantId)
        || routine.protocol?.variants.find((variant) => variant.id === routine.protocol.defaultVariantId)
        || null;
      const fallbackPlannedSeconds = protocolVariant?.metrics.totalSeconds || routine.plannedSeconds || routine.estimatedMinutes * 60;
      const completedAtTime = Date.parse(item.completedAt);
      const importedId = typeof item.id === "string" && /^[A-Za-z0-9._:-]{1,160}$/.test(item.id) ? item.id : null;
      const completion = {
        id: importedId || `${item.date}-${routineId}-${index}`,
        profileId: LEGACY_PROFILE_ALIASES[item.profileId] || "personal",
        routineId,
        date: item.date,
        duration,
        exercises,
        completedAt: Number.isFinite(completedAtTime) ? new Date(completedAtTime).toISOString() : `${item.date}T12:00:00.000Z`,
        plannedMinutes: Math.round(finiteClamped(item.plannedMinutes, 1, 1440, Math.round(fallbackPlannedSeconds / 60))),
        plannedSeconds: Math.round(finiteClamped(item.plannedSeconds, 1, 86400, fallbackPlannedSeconds)),
        protocolVariantId: protocolVariant?.id || null,
        sessionDurationSeconds: Math.round(finiteClamped(item.sessionDurationSeconds, 0, 86400)),
        performance: sanitizePerformance(item.performance)
      };
      // Cada entrada representa una sesión terminada. Solo se sustituye una
      // entrada cuando comparte el mismo identificador estable; entrenar dos
      // veces la misma rutina en un día debe conservar dos registros.
      completionsBySession.set(`${completion.profileId}|${completion.id}`, completion);
    }
    return {
      version: state.version,
      activeProfile: "personal",
      schedules,
      completions: [...completionsBySession.values()],
      preferences: { reducedMotion: state.preferences?.reducedMotion === true },
      activeWorkout: state.activeWorkout && typeof state.activeWorkout === "object" ? state.activeWorkout : null
    };
  }

  return {
    muscleGroups: MUSCLE_GROUPS,
    routineFacets: ROUTINE_FACETS,
    routineFacetTitles: FACET_LABELS,
    durationLabels: DURATION_LABELS,
    buildRoutineCatalog,
    compileRoutineCatalog,
    validateExerciseMetadata,
    validateInventoryMetadata,
    validateRoutineCatalog,
    coverageFor,
    sessionFor,
    buildSessionSteps,
    scheduleMetrics,
    validateWeeklyPresets,
    routineFilterFacets,
    routineMatchesFilters,
    routineFacetLabel,
    exerciseMatchesFilters,
    exerciseFilterFacets,
    migrateState,
    legacyProfileAliases: LEGACY_PROFILE_ALIASES
  };
});
