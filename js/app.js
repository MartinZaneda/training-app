(function () {
  "use strict";

  const DATA = window.TrainingData;
  const PLANNER = window.TrainingPlanner;
  const WORKOUT_ENGINE = window.TrainingWorkout;
  const STATE_IO = window.TrainingStateIO;
  if (!WORKOUT_ENGINE) throw new Error("El motor de entrenamiento no se ha cargado.");
  if (!STATE_IO) throw new Error("El gestor de datos no se ha cargado.");
  DATA.routines = PLANNER.buildRoutineCatalog(DATA.exercises, DATA);
  const DATA_VALIDATIONS = [
    PLANNER.validateInventoryMetadata(DATA),
    PLANNER.validateExerciseMetadata(DATA.exercises, DATA),
    PLANNER.validateRoutineCatalog(DATA.exercises, DATA.routines, DATA)
  ];
  const DATA_ERRORS = DATA_VALIDATIONS.flatMap((validation) => validation.errors);
  if (DATA_ERRORS.length) throw new Error(DATA_ERRORS.join("\n"));
  const WEEKLY_PRESET_VALIDATION = PLANNER.validateWeeklyPresets(DATA.weeklyPresets, DATA.routines);
  if (!WEEKLY_PRESET_VALIDATION.valid) throw new Error(WEEKLY_PRESET_VALIDATION.errors.join("\n"));
  const STORAGE_KEY = "entrenamiento.training.v1";
  const LEGACY_STORAGE_KEYS = Object.freeze(["constancia.training.v1"]);
  const ROUTES = ["inicio", "plan", "biblioteca", "equipamiento", "progreso"];
  const DAY_MS = 86400000;
  const SPANISH_COLLATOR = new Intl.Collator("es", { sensitivity: "base", numeric: true });

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);

  // Alias semánticos de la interfaz hacia nombres oficiales de Lucide 1.31.0.
  const LUCIDE_ICON_NAMES = {
    home: "House",
    calendar: "CalendarDays",
    library: "LibraryBig",
    chart: "ChartNoAxesColumnIncreasing",
    chevron: "ChevronRight",
    selectChevron: "ChevronDown",
    lock: "LockKeyhole",
    clock: "Clock3",
    dumbbell: "Dumbbell",
    activity: "Activity",
    flame: "Flame",
    play: "Play",
    pause: "Pause",
    reset: "RotateCcw",
    check: "Check",
    arrow: "ArrowRight",
    back: "ArrowLeft",
    search: "Search",
    filters: "ListFilter",
    close: "X",
    info: "Info",
    shield: "ShieldCheck",
    zap: "Zap",
    trend: "TrendingUp",
    sparkles: "Sparkles",
    moon: "Moon",
    foot: "Footprints",
    export: "Upload",
    import: "Download",
    trash: "Trash2",
    user: "UserRound",
    package: "Package",
    anchor: "Anchor",
    weight: "Weight",
    bench: "Armchair",
    waves: "Waves",
    alert: "TriangleAlert",
    smile: "Smile",
    neutral: "Meh",
    frown: "Frown"
  };

  const icon = (name, label) => {
    const lucideName = LUCIDE_ICON_NAMES[name] || LUCIDE_ICON_NAMES.activity;
    const iconNode = window.lucide?.icons?.[lucideName];
    if (!iconNode || typeof window.lucide.createElement !== "function") return "";
    const svg = window.lucide.createElement(iconNode);
    svg.classList.add("icon");
    svg.setAttribute("stroke-width", "1.8");
    if (label) {
      svg.setAttribute("role", "img");
      svg.setAttribute("aria-label", String(label));
    } else {
      svg.setAttribute("aria-hidden", "true");
    }
    return svg.outerHTML;
  };

  const BADGE_TONES = Object.freeze([
    "neutral", "primary", "accent", "success", "warning", "danger", "info", "outline",
    "difficulty-basic", "difficulty-basic-intermediate", "difficulty-intermediate",
    "difficulty-intermediate-advanced", "difficulty-advanced", "effort-easy", "effort-normal", "effort-hard"
  ]);

  function renderBadge(text, { tone = "neutral", numeric = false, iconName = "", className = "", label = "" } = {}) {
    const safeTone = BADGE_TONES.includes(tone) ? tone : "neutral";
    const classes = ["ui-badge", `ui-badge--${safeTone}`, numeric ? "ui-badge--number" : "", className].filter(Boolean).join(" ");
    const accessibleLabel = label ? ` aria-label="${escapeHtml(label)}"` : "";
    return `<span class="${classes}"${accessibleLabel}>${iconName ? icon(iconName) : ""}<span>${escapeHtml(text)}</span></span>`;
  }

  function renderNumberBadge(value, options = {}) {
    return renderBadge(value, { ...options, numeric: true });
  }

  function renderDisclosure({ summary, content, className = "", summaryClass = "" }) {
    return `<details class="app-disclosure ${className}"><summary class="${summaryClass}">${summary}<span class="app-disclosure-chevron">${icon("chevron")}</span></summary><div class="app-disclosure-panel"><div class="app-disclosure-clip"><div class="app-disclosure-body">${content}</div></div></div></details>`;
  }

  const disclosureTimers = new WeakMap();
  function toggleDisclosure(disclosure) {
    const activeTimer = disclosureTimers.get(disclosure);
    if (activeTimer) clearTimeout(activeTimer);
    if (disclosure.open && !disclosure.classList.contains("is-collapsing")) {
      disclosure.classList.remove("is-expanded", "is-opening");
      disclosure.classList.add("is-collapsing");
      const duration = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 320;
      const timer = setTimeout(() => {
        disclosure.open = false;
        disclosure.classList.remove("is-collapsing");
        disclosureTimers.delete(disclosure);
      }, duration);
      disclosureTimers.set(disclosure, timer);
      return;
    }
    disclosure.classList.remove("is-collapsing");
    disclosure.classList.add("is-opening");
    disclosure.open = true;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      disclosure.classList.add("is-expanded");
      disclosure.classList.remove("is-opening");
    }));
  }

  const exerciseMedia = (item, alt = "", attributes = "") => item?.image
    ? `<img src="${item.image}" alt="${escapeHtml(alt)}" ${attributes} />`
    : `<span class="exercise-visual-placeholder" role="img" aria-label="Ejercicio sin ilustración"><span>${icon("activity")}</span><strong>${escapeHtml(item?.sourceId ? exerciseTitleFor(item) : titleFor(item?.title || "Ejercicio"))}</strong><small>Sin ilustración</small></span>`;

  const defaultState = () => ({
    version: DATA.appVersion,
    activeProfile: "personal",
    schedules: {},
    completions: [],
    preferences: { reducedMotion: false },
    activeWorkout: null
  });
  const emptyRoutinePickerFilters = (day = null) => ({ day, query: "", panelOpen: false, ...Object.fromEntries(PLANNER.routineFacets.map((facet) => [facet, null])) });
  const ROUTINE_FILTER_DESCRIPTIONS = Object.freeze({
    library: "Separa las rutinas tradicionales de las sesiones por intervalos de alta intensidad.",
    objective: "Prioriza la adaptación que quieres trabajar, como fuerza, hipertrofia o resistencia.",
    type: "Concreta el método de intervalos y el tipo de esfuerzo de la sesión.",
    region: "Delimita la zona corporal que tendrá mayor protagonismo durante la rutina.",
    equipment: "Muestra únicamente las rutinas compatibles con el material que quieres utilizar.",
    duration: "Ajusta la selección al tiempo que tienes disponible para entrenar.",
    level: "Adapta la exigencia técnica y física a tu experiencia actual.",
    pattern: "Prioriza el patrón de movimiento dominante dentro de la sesión.",
    station: "Filtra según el montaje y la colocación principal del equipamiento.",
    format: "Elige cómo se organizan las series, los bloques o los intervalos.",
    logistics: "Controla cuántos cambios de material o de montaje requiere la rutina.",
    complement: "Indica si buscas una sesión independiente o un complemento para otro entrenamiento."
  });

  let storageRecovered = false;
  let legacyStorageDetected = false;
  let state = loadState();
  let route = "inicio";
  let libraryFilters = { query: "", muscle: null, specificMuscle: null, equipment: null, difficulty: null, panelOpen: false };
  let routinePickerFilters = emptyRoutinePickerFilters();
  let progressFilters = { query: "", range: "all", visible: 20 };
  let workout = state.activeWorkout;
  let workoutTicker = null;
  let lastWorkoutPersist = 0;
  let announcedTimerFinish = "";
  let detailContext = null;
  let routinePickerPreviewDay = null;
  let pendingReset = false;
  let pendingWeeklyPreset = null;
  let pendingWorkoutStart = null;

  if (storageRecovered || legacyStorageDetected) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      LEGACY_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
    } catch (error) { /* La app continúa con el estado recuperado en memoria. */ }
  }

  function loadState() {
    try {
      let raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        for (const legacyKey of LEGACY_STORAGE_KEYS) {
          raw = localStorage.getItem(legacyKey);
          if (raw) { legacyStorageDetected = true; break; }
        }
      }
      if (!raw) return defaultState();
      const parsed = PLANNER.migrateState(JSON.parse(raw), DATA.routines, DATA);
      parsed.version = DATA.appVersion;
      if (!parsed || parsed.version !== DATA.appVersion || !DATA.profiles[parsed.activeProfile] || !Array.isArray(parsed.completions)) throw new Error("Formato no válido");
      const next = { ...defaultState(), ...parsed, preferences: { ...defaultState().preferences, ...parsed.preferences } };
      if (!next.schedules || typeof next.schedules !== "object") next.schedules = {};
      next.activeWorkout = WORKOUT_ENGINE.sanitizeWorkout(next.activeWorkout, DATA.routines, DATA.exercises, DATA);
      return next;
    } catch (error) {
      storageRecovered = true;
      return defaultState();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (error) {
      toast("No se pudo guardar en este navegador.", true);
      return false;
    }
  }

  function localDate(date = new Date()) {
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 10);
  }

  function parseLocalDate(value) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  function mondayOf(date = new Date()) {
    const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const day = (result.getDay() + 6) % 7;
    result.setDate(result.getDate() - day);
    result.setHours(0, 0, 0, 0);
    return result;
  }

  function addDays(date, count) {
    const result = new Date(date);
    result.setDate(result.getDate() + count);
    return result;
  }

  function dayIndex(date = new Date()) { return (date.getDay() + 6) % 7; }
  function profile() { return DATA.profiles[state.activeProfile]; }
  function routine(id) { return id ? DATA.routines[id] || null : null; }
  function exercise(id) { return DATA.exercises.find((item) => item.id === id); }
  function clearDocumentText(value) {
    let text = String(value ?? "");
    text = text.replace(/\bE\d{2}\b/g, (sourceId) => {
      const movement = DATA.exercises.find((item) => item.sourceId === sourceId);
      return movement ? `«${exerciseTitleFor(movement)}»` : "ejercicio documentado";
    });
    text = text.replace(/\b[RH]\d{2}\b/g, (sourceId) => {
      const documentedRoutine = routine(sourceId);
      return documentedRoutine ? `«${routineTitleFor(documentedRoutine)}»` : "rutina documentada";
    });
    const replacements = [
      [/\bPower Tens\b/gi, "diez paladas de potencia"],
      [/\bFull[- ]Body\b/gi, "cuerpo completo"],
      [/\bUpper-body\b/gi, "tren superior"],
      [/\bPush press\b/gi, "press con impulso"],
      [/\bClean\s*&\s*press\b/gi, "cargada y press"],
      [/\bGoblet squat\b/gi, "sentadilla de copa"],
      [/\bBulgarian split squat\b/gi, "sentadilla búlgara"],
      [/\bSplit squat\b/gi, "sentadilla dividida"],
      [/\bSit-to-stand\b/gi, "sentarse y levantarse"],
      [/\bRear-delt row\b/gi, "remo para deltoides posterior"],
      [/\bReverse fly\b/gi, "apertura inversa"],
      [/\bFace pull\b/gi, "tirón hacia la cara"],
      [/\bPressdown\b/gi, "extensión hacia abajo"],
      [/\bStraight-arm pulldown\b/gi, "jalón con brazos rectos"],
      [/\bPulldown\b/gi, "jalón"],
      [/\bGood morning\b/gi, "buenos días"],
      [/\bPull-through\b/gi, "extensión de cadera"],
      [/\bHip thrust\b/gi, "empuje de cadera"],
      [/\bHigh pull\b/gi, "tirón alto"],
      [/\bFarmer carry\b/gi, "paseo del granjero"],
      [/\bSuitcase carry\b/gi, "paseo con carga unilateral"],
      [/\bOverhead carry\b/gi, "paseo con carga sobre la cabeza"],
      [/\bTurkish get-up\b/gi, "levantamiento turco"],
      [/\bRenegade row\b/gi, "remo en plancha"],
      [/\bWood chop\b/gi, "corte diagonal"],
      [/\bPallof press\b/gi, "press contra la rotación"],
      [/\bChin-Up\b/gi, "accesorio de dominadas"],
      [/\bSit-up\b/gi, "incorporación abdominal"],
      [/\bSitup\b/gi, "incorporación abdominal"],
      [/\bCrunch\b/gi, "encogimiento abdominal"],
      [/\bThruster\b/gi, "sentadilla con press"],
      [/\bFront squat\b/gi, "sentadilla frontal"],
      [/\bKnee raise\b/gi, "elevación de rodillas"],
      [/\bShrug\b/gi, "encogimiento de hombros"],
      [/\bBulgarian\b/gi, "sentadilla búlgara"],
      [/\bSquat\b/gi, "sentadilla"],
      [/\bSwings\b/gi, "balanceos"],
      [/\bCleans\b/gi, "cargadas"],
      [/\bSnatch\b/gi, "arrancada"],
      [/\bClean\b/gi, "cargada"],
      [/\bSwing\b/gi, "balanceo"],
      [/\bGoblet\b/gi, "sentadilla de copa"],
      [/\bRDL\b/g, "peso muerto rumano"],
      [/\bHinge\b/gi, "bisagra de cadera"],
      [/\bFly\b/gi, "apertura"],
      [/\bWindmill\b/gi, "molino"],
      [/\bLift\b/gi, "elevación diagonal"],
      [/\bEMOM\b/g, "una serie al inicio de cada minuto"],
      [/\bHIFT\b/g, "entrenamiento funcional de alta intensidad"],
      [/\bSIT\b/g, "intervalos de velocidad"],
      [/\bHIIT\b/g, "intervalos de alta intensidad"],
      [/\bUpper\b/gi, "tren superior"],
      [/\bLower\b/gi, "tren inferior"],
      [/\bPush\b/gi, "empuje"],
      [/\bPull\b/gi, "tirón"],
      [/\bCore\b/gi, "zona media"],
      [/\bBench\b/gi, "banco"],
      [/\bBodyweight\b/gi, "peso corporal"],
      [/\bAttachments\b/gi, "accesorios"],
      [/\bAttachment\b/gi, "accesorio"],
      [/\bClusters?\b/gi, "bloques"],
      [/\bIntervals?\b/gi, "por intervalos"],
      [/\bOverhead\b/gi, "sobre la cabeza"],
      [/\bCarries\b/gi, "paseos con carga"],
      [/\bCarry\b/gi, "paseo con carga"],
      [/\bSprints cortos\b/gi, "aceleraciones cortas"],
      [/\bSprints\b/gi, "aceleraciones"],
      [/\bSprint\b/gi, "aceleración intensa"],
      [/\bTempo\b/gi, "ritmo sostenido"],
      [/\bRower\b/gi, "máquina de remo"],
      [/\bCardio\b/gi, "entrenamiento cardiovascular"],
      [/\bKettlebells\b/gi, "pesas rusas"],
      [/\bKettlebell\b/gi, "pesa rusa"],
      [/\bKB\b/g, "pesa rusa"],
      [/\bDB\b/g, "mancuerna"],
      [/\bReps\b/gi, "repeticiones"],
      [/\bBouts\b/gi, "intervalos"],
      [/Bluetooth\s*·\s*ANT\+\s*·\s*FTMS/gi, "conectividad inalámbrica Bluetooth"],
      [/\bBluetooth\s+y\s+ANT\+/gi, "conectividad inalámbrica Bluetooth"],
      [/\bAplicaciones\s+FTMS\b/gi, "aplicaciones compatibles con equipos de entrenamiento"],
      [/\bDamper\s+de\s+aire\b/gi, "regulador de aire"],
      [/\bDamper\b/gi, "regulador de aire"],
      [/\bLCD\b/g, "pantalla"],
      [/ANT\+/g, "conectividad inalámbrica"],
      [/\bFTMS\b/g, "protocolo inalámbrico de equipos de entrenamiento"],
      [/\bR\/L\b/g, "a ambos lados"],
      [/\bc\/u\b/gi, "cada una"],
      [/\btren inferior\/tren superior\b/gi, "tren inferior y tren superior"],
      [/\bSmartBells?\/pesa rusa\b/gi, "SmartBells o pesa rusa"],
      [/\bmancuernas?\/pesa rusa\b/gi, "mancuernas o pesa rusa"],
      [/\bpesa rusa\/mancuernas?\b/gi, "pesa rusa o mancuernas"],
      [/\b1:1\b/g, "con trabajo y recuperación de igual duración"],
      [/\b60:60\b/g, "con 60 segundos de trabajo y 60 de recuperación"],
      [/\b45:15\b/g, "con 45 segundos de trabajo y 15 de recuperación"],
      [/\b40:20\b/g, "con 40 segundos de trabajo y 20 de recuperación"],
      [/\b30:30\b/g, "con 30 segundos de trabajo y 30 de recuperación"],
      [/\b20:100\b/g, "con 20 segundos de trabajo y 100 de recuperación"],
      [/\b20:40\b/g, "con 20 segundos de trabajo y 40 de recuperación"],
      [/\b20:10\b/g, "con 20 segundos de trabajo y 10 de recuperación"],
      [/\bbarra-band\b/gi, "barra con bandas"],
      [/\bbar-band\b/gi, "barra con banda"],
      [/\bKickback\b/gi, "patada de tríceps"],
      [/\ben rack\b/gi, "en posición frontal"],
      [/\brack\b/gi, "soporte para pesas"],
      [/\b1:00\b/g, "1 minuto"],
      [/\b0:(\d{2})\b/g, "$1 segundos"],
      [/\b1\s+min\b/gi, "1 minuto"],
      [/\bmin\b/gi, "minutos"],
      [/\b1\s+s(?=\b|\/)/g, "1 segundo"],
      [/(\d(?:[\d,.–]*))\s+s(?=\b|\/)/g, "$1 segundos"],
      [/\bkgf\b/gi, "kgf"],
      [/\bkg\b/gi, "kg"],
      [/\blb\b/gi, "libras"],
      [/\s+\/\s+/g, " y "]
    ];
    for (const [pattern, replacement] of replacements) text = text.replace(pattern, replacement);
    return text.replace(/\s{2,}/g, " ").trim();
  }
  function clearBandReferences(value) {
    return String(value)
      .replace(/\bbanda #0\s*[–-]\s*#4\b/gi, "una banda de resistencia ligera a media")
      .replace(/\bbanda #0\s*[–-]\s*#3\b/gi, "una banda ligera o moderada")
      .replace(/#5\s*[–-]\s*#7/g, "las bandas de mayor resistencia")
      .replace(/#0\s*[–-]\s*#4/g, "bandas de resistencia ligera a media")
      .replace(/#0\s*[–-]\s*#3/g, "bandas ligeras o moderadas")
      .replace(/#0\s*\/\s*#1/g, "las dos bandas más ligeras")
      .replace(/#0\s+o\s+#1/g, "las dos bandas más ligeras")
      .replace(/\bbanda #0\b/gi, "la banda más ligera")
      .replace(/#0/g, "la banda más ligera")
      .replace(/#1/g, "la segunda banda más ligera")
      .replace(/#\d+/g, "una banda identificada por su color");
  }
  function clearProseText(value) {
    return clearBandReferences(clearDocumentText(value))
      .replace(/»\s*\/\s*«/g, "» y «")
      .replace(/\btrabajo\s*\/\s*/gi, "de trabajo y ")
      .replace(/\bpress\s*\/\s*sentadilla\b/gi, "press y sentadilla")
      .replace(/\bempuje\s*\/\s*tirón\b/gi, "empuje y tirón")
      .replace(/\s*\+\s*/g, " y ")
      .replace(/\s*\/\s*/g, " o ")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  function techniqueSafetyContent(movement) {
    const rawCue = String(movement?.cue ?? "").trim();
    let rawSafety = String(movement?.safety ?? "").trim();
    if (rawCue && rawSafety.toLocaleLowerCase("es").startsWith(rawCue.toLocaleLowerCase("es"))) {
      rawSafety = rawSafety.slice(rawCue.length).trim();
    }
    const points = rawSafety
      .replace(/;\s*(?=(?:regresión|progresión)\b)/gi, ".\n")
      .replace(/([.!?])\s+(?=[A-ZÁÉÍÓÚÑÜ0-9¿¡])/g, "$1\n")
      .split("\n")
      .map((point) => clearProseText(point))
      .filter(Boolean);
    const normalizedDose = clearProseText(movement?.dose).replace(/[.!?]+$/g, "").toLocaleLowerCase("es");
    const safetyPoints = [clearProseText(rawCue), ...points]
      .filter(Boolean)
      .filter((point) => point.replace(/[.!?]+$/g, "").toLocaleLowerCase("es") !== normalizedDose)
      .filter((point, index, collection) => collection.findIndex((candidate) => SPANISH_COLLATOR.compare(candidate, point) === 0) === index);
    return {
      steps: (movement?.steps || []).map((step) => clearProseText(step)).filter(Boolean),
      safetyPoints
    };
  }

  function renderTechniqueSteps(steps) {
    if (!steps.length) return "";
    return `<ol class="workout-technique-steps">${steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>`;
  }

  function renderSafetyPoints(points) {
    if (!points.length) return "";
    return `<ul class="workout-safety-points">${points.map((point) => `<li>${escapeHtml(point)}</li>`).join("")}</ul>`;
  }
  function clearEquipmentText(value) {
    return clearBandReferences(clearDocumentText(value))
      .replace(/\bDB\b/g, "mancuernas")
      .replace(/\bKB\b/g, "pesa rusa")
      .replace(/\bc\/u\b/gi, "por unidad")
      .replace(/(\d(?:[\d,.–]*))\s+kg\+/g, "$1 kg o más")
      .replace(/\s*\+\s*/g, " y ")
      .replace(/\s*\/\s*/g, " o ")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  function renderMaterialPreparation(movement, logistics, selection) {
    const alternativeEquipmentIds = new Set(DATA.equipment.filter((item) => item.selection && item.selection.type !== "fixed").map((item) => item.id));
    const materials = (movement?.equipmentRefs || [])
      .filter((ref) => ref.kind !== "equipment" || !alternativeEquipmentIds.has(ref.id) || ref.id === selection?.modality)
      .map((ref) => equipmentRecord(ref))
      .filter(Boolean)
      .map((record) => clearEquipmentText(equipmentNameFor(record)))
      .filter((name, index, collection) => collection.findIndex((candidate) => SPANISH_COLLATOR.compare(candidate, name) === 0) === index);
    const configuration = [
      ["Configuración del ejercicio", clearEquipmentText(movement?.equipment)],
      ["Selección actual", selectionSummary(selection)],
      logistics ? ["Orden durante la rutina", clearSequenceText(logistics)] : null
    ]
      .filter((entry) => entry?.[1])
      .filter((entry, index, collection) => collection.findIndex((candidate) => SPANISH_COLLATOR.compare(candidate[1], entry[1]) === 0) === index);
    return renderDisclosure({
      className: "workout-details material-preparation-details",
      summary: "Preparación de material",
      content: `<section class="workout-reference-section"><h4>Material necesario</h4><ul class="workout-material-list">${materials.map((name) => `<li>${escapeHtml(name)}</li>`).join("")}</ul></section><section class="workout-reference-section"><h4>Configuración</h4><ul class="workout-material-configuration">${configuration.map(([label, value]) => `<li><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></li>`).join("")}</ul></section>`
    });
  }
  function clearSequenceText(value) {
    let text = String(value ?? "")
      .replace(/\bE\d{2}\s*\/\s*E\d{2}\b/g, "")
      .replace(/\bE\d{2}\b/g, "")
      .replace(/\b[RH]\d{2}\b/g, "")
      .replace(/\bBloque A\b/gi, "Primer bloque")
      .replace(/\bBloque B\b/gi, "Segundo bloque")
      .replace(/\bBloque C\b/gi, "Tercer bloque")
      .replace(/\bA\)/g, "Primero:")
      .replace(/\bB\)/g, "Segundo:")
      .replace(/\bC\)/g, "Tercero:");
    text = clearDocumentText(text)
      .replace(/\s*\+\s*/g, " y ")
      .replace(/\/lado\b/gi, " por lado")
      .replace(/\bSmartBells?\s*\/\s*pesa rusa\b/gi, "SmartBells o pesa rusa")
      .replace(/\bmancuernas?\s*\/\s*pesa rusa\b/gi, "mancuernas o pesa rusa")
      .replace(/\bpesa rusa\s*\/\s*mancuernas?\b/gi, "pesa rusa o mancuernas")
      .replace(/\bpress plano mancuerna\b/gi, "press plano con mancuernas")
      .replace(/\s*\/\s*/g, " y ")
      .replace(/(\d(?:[\d,.–]*))\s+m\b/g, "$1 metros")
      .replace(/\s+([,.;:])/g, "$1")
      .replace(/\s{2,}/g, " ")
      .trim();
    return text;
  }
  function protocolStructureSteps(session) {
    const raw = String(session?.items?.[0]?.prescription || "").trim();
    if (!raw) return [];
    const recoveryPattern = /^(?:\d+(?:[,.]\d+)?(?:[–-]\d+(?:[,.]\d+)?)?\s+)?(?:segundos?|minutos?)(?:\s+(?:de\s+)?(?:pausa|descanso|recuperación|transición|suaves?))?[.!]?$/i;
    const durationPattern = /\d+(?:[,.]\d+)?(?:[–-]\d+(?:[,.]\d+)?)?\s+(?:segundos?|minutos?)/i;
    const steps = [];
    raw
      .replace(/\s*→\s*/g, "\n")
      .split(/\n|(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑÜ0-9])/u)
      .map((part) => clearSequenceText(part).replace(/\s*[.!?]+$/g, "").trim())
      .filter(Boolean)
      .forEach((part) => {
        if (recoveryPattern.test(part) && steps.length) {
          const duration = part.match(durationPattern)?.[0];
          if (duration && !steps.at(-1).includes(`Recuperación: ${duration}`)) steps[steps.length - 1] += ` · Recuperación: ${duration}`;
          return;
        }
        const normalized = /^\d+(?:[–-]\d+)?\s+rondas?\b/i.test(part)
          ? `Repite ${part.charAt(0).toLocaleLowerCase("es")}${part.slice(1)}`
          : part;
        if (!steps.some((step) => SPANISH_COLLATOR.compare(step, normalized) === 0)) steps.push(normalized);
      });
    return steps;
  }
  function titleFor(value) {
    const title = clearDocumentText(value).replace(/\s+\+\s+/g, " y ").replace(/\s*\/\s*/g, " o ").replace(/^Máquina de remo/i, "Remo");
    return title.charAt(0).toLocaleUpperCase("es") + title.slice(1);
  }
  function routineTitleFor(routineItem) { return routineItem?.title || "Rutina"; }
  function exerciseTitleFor(exerciseItem) { return exerciseItem?.name || "Ejercicio"; }
  function equipmentNameFor(item) { return item?.name || "Equipamiento"; }
  function facetValues(facet, values) {
    return [...new Set((values || []).map((value) => PLANNER.routineFacetLabel(facet, value)))];
  }
  function profileSchedule() {
    const saved = state.schedules?.[state.activeProfile];
    const valid = Array.isArray(saved) && saved.length === 7 && saved.every((id) => !id || routine(id));
    if (valid) return saved;
    const emptySchedule = Array(7).fill(null);
    state.schedules = { ...(state.schedules || {}), [state.activeProfile]: emptySchedule };
    saveState();
    return emptySchedule;
  }
  function saveSchedule(schedule) {
    state.schedules = { ...(state.schedules || {}), [state.activeProfile]: schedule };
    saveState();
  }
  function weeklyPreset(id) {
    return DATA.weeklyPresets.find((preset) => preset.id === id) || null;
  }
  function renderWeeklyPresetOption(preset) {
    return `<article class="weekly-preset-option">
      <header class="weekly-preset-header"><span class="weekly-preset-icon">${icon(preset.icon)}</span><div><h3>${escapeHtml(preset.title)}</h3><span>${escapeHtml(preset.summary)}</span></div></header>
      <p>${escapeHtml(preset.description)}</p>
      <button class="button button-secondary" type="button" data-action="request-weekly-preset" data-preset="${escapeHtml(preset.id)}">Aplicar plan ${icon("arrow")}</button>
    </article>`;
  }
  function equipmentRecord(ref) {
    if (!ref) return null;
    if (ref.kind === "equipment") {
      const item = DATA.equipment.find((entry) => entry.id === ref.id);
      return item ? { ...item, kind: ref.kind, label: item.category } : null;
    }
    if (ref.kind === "bench-accessory") {
      const parent = DATA.equipment.find((entry) => entry.accessories?.some((item) => item.id === ref.id));
      const item = parent?.accessories?.find((entry) => entry.id === ref.id);
      return item ? { ...item, kind: ref.kind, icon: item.icon || parent.icon, label: item.category, description: item.description || item.detail, note: item.note || parent.note, parentName: parent.name } : null;
    }
    if (ref.kind === "band-accessory") {
      const item = DATA.equipmentAccessories.find((entry) => entry.id === ref.id);
      const parent = DATA.equipment.find((entry) => entry.id === item?.parentId);
      return item ? { ...item, kind: ref.kind, label: item.category, parentName: parent?.name } : null;
    }
    if (ref.kind === "anchor") {
      const item = DATA.bandAnchors.find((entry) => entry.id === ref.id);
      return item ? { ...item, kind: ref.kind, label: item.position, description: item.description || item.detail } : null;
    }
    const item = DATA.supports?.[ref.id];
    return item ? { ...item, kind: "support", label: item.category } : null;
  }
  function routineSession(routineItem) { return PLANNER.sessionFor(routineItem); }
  function visibleItems(routineItem) { return routineSession(routineItem).items; }
  function durationFor(routineItem) {
    const [minimum, maximum] = routineItem.durationRange;
    return minimum === maximum ? `${minimum} minutos totales` : `${minimum}–${maximum} minutos totales`;
  }
  function routineUnitLabel(routineItem) {
    if (!routineItem.protocol) return `${routineItem.items.length} ${routineItem.items.length === 1 ? "ejercicio" : "ejercicios"}`;
    return `1 protocolo guiado${routineItem.exerciseIds.length ? ` · ${routineItem.exerciseIds.length} ${routineItem.exerciseIds.length === 1 ? "ejercicio" : "ejercicios"}` : ""}`;
  }

  function formatClock(seconds) {
    const value = Math.max(0, Math.ceil(Number(seconds) || 0));
    const hours = Math.floor(value / 3600);
    const minutes = Math.floor(value % 3600 / 60);
    const remainder = value % 60;
    return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}` : `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
  }
  function formatDuration(seconds) {
    const value = Math.max(0, Math.round(Number(seconds) || 0));
    const minutes = Math.floor(value / 60);
    const remainder = value % 60;
    if (!minutes) return `${remainder} s`;
    return remainder ? `${minutes} min ${remainder} s` : `${minutes} min`;
  }

  function selectionRecord(modality) {
    return WORKOUT_ENGINE.selectionRecords(DATA).find((item) => item.selection?.modality === modality) || null;
  }

  function renderWorkoutTimer(seconds, { rest = false, completed = false } = {}) {
    const stateName = completed ? "completed" : workout.timer.running ? "running" : "paused";
    const stateLabel = completed ? "Finalizado" : workout.timer.running ? "En marcha" : "Pausado";
    const accessibleLabel = `${rest ? "Cronómetro de descanso" : "Cronómetro"} ${stateLabel.toLocaleLowerCase("es")}`;
    return `<div class="workout-timer is-${stateName}${rest ? " is-rest" : ""}" role="timer" aria-label="${accessibleLabel}: ${formatClock(seconds)}" data-timer-state-label="${accessibleLabel}"><strong data-workout-timer>${formatClock(seconds)}</strong></div>`;
  }

  function modalityLabel(modality) {
    return selectionRecord(modality)?.selection?.label || "";
  }

  function selectionSummary(selection) {
    if (!selection) return "Sin registro anterior";
    const record = selectionRecord(selection.modality);
    if (record?.selection?.type === "load") return `${String(selection.loadKg).replace(".", ",")} ${record.selection.summaryUnit}`;
    if (record?.selection?.type === "band") {
      const band = DATA.bands.find((item) => item.id === selection.bandId);
      return band ? `${selection.bandCount > 1 ? `${selection.bandCount} bandas` : "Banda"} ${band.color.toLocaleLowerCase("es")} · ${band.pounds} libras cada una` : "";
    }
    if (record?.selection?.type === "damper") return `${record.selection.seriesFieldLabel} en posición ${selection.damper}`;
    return record?.selection?.staticValue || record?.selection?.label || "";
  }

  function effortMeta(value) {
    const normalized = WORKOUT_ENGINE.normalizeEffort(value);
    return DATA.effortLevels.find((item) => item.id === normalized) || null;
  }

  function difficultyTone(value) {
    return ({
      "Básico": "basic",
      "Básico–intermedio": "basic-intermediate",
      "Intermedio": "intermediate",
      "Intermedio–avanzado": "intermediate-advanced",
      "Avanzado": "advanced"
    })[value] || "intermediate";
  }

  function difficultyBadgeLabel(value) {
    return ({
      "Básico–intermedio": "Intermedio",
      "Intermedio–avanzado": "Avanzado"
    })[value] || value;
  }

  function renderEffortRating(value, context, compact = false) {
    const selected = effortMeta(value);
    const options = DATA.effortLevels.map((item) => {
      const active = value === item.id;
      return `<div class="effort-choice"><button type="button" class="effort-button effort-${item.id} ${active ? "is-selected" : ""}" data-action="workout-set-effort" data-context="${context}" data-effort="${item.id}" role="radio" aria-checked="${active}" aria-label="${item.label}: ${item.action.toLocaleLowerCase("es")}" title="${item.label}: ${item.action.toLocaleLowerCase("es")}">${icon(item.icon)}</button><strong>${item.label}</strong><small>${item.action}</small></div>`;
    }).join("");
    return `<section class="effort-rating ${compact ? "is-compact" : ""}" aria-label="Esfuerzo percibido"><div class="effort-rating-copy"><p class="eyebrow">Al terminar el ejercicio</p><h3>¿Cómo te ha resultado?</h3><p>Tu respuesta orientará la carga de la próxima sesión.</p></div><div class="effort-choices" role="radiogroup" aria-label="Seleccionar nivel de esfuerzo">${options}</div><p class="effort-advice ${selected ? "is-visible" : ""}" aria-live="polite">${selected ? `${icon(selected.icon)}<span><strong>${selected.action}.</strong> ${selected.advice}</span>` : `${icon("info")}<span>Selecciona fácil, normal o difícil al acabar.</span>`}</p></section>`;
  }

  function renderPerformanceDetails(record) {
    const entries = record.performance || [];
    if (!entries.length) return "";
    return `<div class="performance-log">${entries.map((entry) => {
      const movement = exercise(entry.exerciseId);
      const completedSets = (entry.sets || []).filter((set) => set.completed || set.skipped);
      const effort = effortMeta(entry.effort);
      return `<article class="performance-entry"><div><strong>${escapeHtml(exerciseTitleFor(movement))}</strong>${entry.selection ? `<small>${escapeHtml(selectionSummary(entry.selection))}</small>` : ""}</div>${effort ? renderBadge(`${effort.label} · ${effort.action} la próxima vez`, { tone: `effort-${entry.effort}`, iconName: effort.icon, className: "performance-effort-badge" }) : ""}<div class="performance-sets">${completedSets.map((set) => {
        const detail = set.skipped ? `Serie ${set.number} omitida` : `Serie ${set.number}${set.reps !== null ? ` · ${set.reps} repeticiones` : ""}${set.durationSeconds ? ` · ${formatClock(set.durationSeconds)}` : ""}${set.repetitionsInReserve !== null ? ` · ${set.repetitionsInReserve} en reserva` : ""}${set.selection ? ` · ${selectionSummary(set.selection)}` : ""}`;
        return renderBadge(detail, { tone: "outline", className: `performance-set-badge${set.skipped ? " is-skipped" : ""}` });
      }).join("")}</div>${entry.notes ? `<p class="performance-note"><strong>Nota</strong><span>${escapeHtml(entry.notes)}</span></p>` : ""}</article>`;
    }).join("")}</div>`;
  }

  function previousPerformance() {
    const latest = {};
    const records = state.completions
      .filter((item) => item.profileId === state.activeProfile)
      .sort((first, second) => String(second.completedAt).localeCompare(String(first.completedAt)));
    for (const record of records) {
      for (const entry of record.performance || []) {
        if (!latest[entry.exerciseId]) latest[entry.exerciseId] = { ...entry, date: record.date };
      }
    }
    return latest;
  }

  function persistWorkout(force = false) {
    if (!workout) return;
    const now = Date.now();
    if (!force && now - lastWorkoutPersist < 4000) return;
    workout.updatedAt = now;
    state.activeWorkout = workout;
    lastWorkoutPersist = now;
    saveState();
  }

  function pauseWorkoutTimers() {
    if (!workout) return;
    const now = Date.now();
    workout.timer = WORKOUT_ENGINE.pauseTimer(workout.timer, now);
    workout.sessionTimer = WORKOUT_ENGINE.pauseTimer(workout.sessionTimer, now);
    persistWorkout(true);
  }

  function closeWorkout() {
    pauseWorkoutTimers();
    stopWorkoutTicker();
    const screen = document.getElementById("workout-screen");
    const shell = document.querySelector(".app-shell");
    if (screen) screen.hidden = true;
    if (shell) shell.hidden = false;
    document.body.classList.remove("workout-open");
    renderHome();
    window.scrollTo({ top: 0, behavior: "auto" });
    window.setTimeout(() => document.querySelector("[data-action='start-workout']")?.focus({ preventScroll: true }), 0);
  }

  function setTimerForCurrentSet() {
    if (!workout || workout.interval) return;
    const step = workout.steps[workout.currentStepIndex];
    const set = step?.sets[step.currentSetIndex];
    const duration = step?.plan.targetType === "seconds" ? set?.targetSeconds || step.plan.targetMin : 0;
    workout.timer = WORKOUT_ENGINE.createTimer(duration ? "countdown" : "countup", duration);
    workout.phase = "ready";
    announcedTimerFinish = "";
  }

  function currentStepResolved() {
    if (!workout || workout.interval) return false;
    return workout.steps[workout.currentStepIndex]?.sets.every((set) => set.completed || set.skipped) || false;
  }

  function prepareNextStrengthStep() {
    if (!workout || workout.interval) return false;
    const nextStep = workout.steps.findIndex((step) => step.sets.some((set) => !set.completed && !set.skipped));
    if (nextStep < 0) return false;
    workout.currentStepIndex = nextStep;
    const step = workout.steps[nextStep];
    step.currentSetIndex = Math.max(0, step.sets.findIndex((set) => !set.completed && !set.skipped));
    setTimerForCurrentSet();
    return true;
  }

  function finishStrengthRest() {
    if (!workout || workout.interval || workout.phase !== "rest") return;
    workout.timer = WORKOUT_ENGINE.resetTimer(workout.timer);
    if (currentStepResolved()) workout.phase = "ready";
    else setTimerForCurrentSet();
    announcedTimerFinish = "";
    persistWorkout(true);
    renderWorkout();
  }

  function renderEquipmentControl(selection, movement, context) {
    const modalities = WORKOUT_ENGINE.modalityOptions(movement, DATA);
    const modalityOptions = modalities.map((item) => `<option value="${escapeHtml(item)}" ${selection.modality === item ? "selected" : ""}>${escapeHtml(modalityLabel(item))}</option>`).join("");
    const record = selectionRecord(selection.modality);
    const selectionDefinition = record?.selection;
    let detail = selectionDefinition ? `<p class="equipment-current">${escapeHtml(selectionDefinition.staticValue || selectionDefinition.label)}</p>` : "";
    if (selectionDefinition?.type === "load") {
      detail = `<label class="workout-field"><span>${escapeHtml(selectionDefinition.fieldLabel)}</span><select data-workout-control="load" data-context="${context}">${record.variants.map((variant) => {
        const value = Number(variant.replace(",", "."));
        return `<option value="${value}" ${selection.loadKg === value ? "selected" : ""}>${escapeHtml(variant)} ${escapeHtml(record.unit)}</option>`;
      }).join("")}</select></label>`;
    } else if (selectionDefinition?.type === "band") {
      const currentBand = DATA.bands.find((item) => item.id === selection.bandId) || DATA.bands[0];
      detail = `<div class="equipment-control-row"><label class="workout-field"><span>${escapeHtml(selectionDefinition.fieldLabel)}</span><select data-workout-control="band" data-context="${context}">${DATA.bands.map((band) => `<option value="${escapeHtml(band.id)}" ${currentBand.id === band.id ? "selected" : ""}>${escapeHtml(band.color)} · ${band.pounds} libras</option>`).join("")}</select></label><label class="workout-field workout-field-small"><span>Cantidad</span><select data-workout-control="band-count" data-context="${context}">${Array.from({ length: currentBand.quantity }, (_, index) => `<option value="${index + 1}" ${selection.bandCount === index + 1 ? "selected" : ""}>${index + 1}</option>`).join("")}</select></label></div>`;
    } else if (selectionDefinition?.type === "damper") {
      detail = `<label class="workout-field"><span>${escapeHtml(selectionDefinition.fieldLabel)}</span><select data-workout-control="damper" data-context="${context}">${record.variants.map((variant) => `<option value="${escapeHtml(variant)}" ${selection.damper === Number(variant) ? "selected" : ""}>${escapeHtml(variant)}</option>`).join("")}</select><small>${escapeHtml(selectionDefinition.help)}</small></label>`;
    }
    return `<section class="workout-panel equipment-log" aria-labelledby="equipment-${context}"><div class="workout-panel-heading"><div><span class="eyebrow">Diario de material</span><h3 id="equipment-${context}">Configuración de este ejercicio</h3></div>${icon("dumbbell")}</div>${modalities.length > 1 ? `<label class="workout-field"><span>Material que vas a usar</span><select data-workout-control="modality" data-context="${context}">${modalityOptions}</select></label>` : `<p class="equipment-modality">${escapeHtml(modalityLabel(selection.modality))}</p>`}${detail}</section>`;
  }

  function renderSeriesSelectionFields(selection, movement) {
    const modalities = WORKOUT_ENGINE.modalityOptions(movement, DATA);
    const record = selectionRecord(selection.modality);
    const selectionDefinition = record?.selection;
    const fields = [];
    if (modalities.length > 1) {
      fields.push(`<label class="workout-field workout-field-modality"><span>Material utilizado</span><select data-workout-control="modality" data-context="step">${modalities.map((item) => `<option value="${escapeHtml(item)}" ${selection.modality === item ? "selected" : ""}>${escapeHtml(modalityLabel(item))}</option>`).join("")}</select></label>`);
    }
    if (selectionDefinition?.type === "load") {
      fields.push(`<label class="workout-field"><span>${escapeHtml(selectionDefinition.seriesFieldLabel)}</span><select data-workout-control="load" data-context="step">${record.variants.map((variant) => {
        const value = Number(variant.replace(",", "."));
        return `<option value="${value}" ${selection.loadKg === value ? "selected" : ""}>${escapeHtml(variant)} ${escapeHtml(record.unit)}</option>`;
      }).join("")}</select></label>`);
    } else if (selectionDefinition?.type === "band") {
      const currentBand = DATA.bands.find((item) => item.id === selection.bandId) || DATA.bands[0];
      fields.push(`<label class="workout-field"><span>${escapeHtml(selectionDefinition.seriesFieldLabel)}</span><select data-workout-control="band" data-context="step">${DATA.bands.map((band) => `<option value="${escapeHtml(band.id)}" ${currentBand.id === band.id ? "selected" : ""}>${escapeHtml(band.color)} · ${band.pounds} libras</option>`).join("")}</select></label>`);
      fields.push(`<label class="workout-field"><span>Cantidad de bandas</span><select data-workout-control="band-count" data-context="step">${Array.from({ length: currentBand.quantity }, (_, index) => `<option value="${index + 1}" ${selection.bandCount === index + 1 ? "selected" : ""}>${index + 1}</option>`).join("")}</select></label>`);
    } else if (selectionDefinition?.type === "damper") {
      fields.push(`<label class="workout-field"><span>${escapeHtml(selectionDefinition.seriesFieldLabel)}</span><select data-workout-control="damper" data-context="step">${record.variants.map((variant) => `<option value="${escapeHtml(variant)}" ${selection.damper === Number(variant) ? "selected" : ""}>${escapeHtml(variant)}</option>`).join("")}</select></label>`);
    } else {
      fields.push(`<div class="workout-field series-static-field"><span>${escapeHtml(selectionDefinition.seriesFieldLabel)}</span><strong>${escapeHtml(selectionDefinition.staticValue)}</strong></div>`);
    }
    return fields.join("");
  }

  function completionFor(date, routineId) {
    const dateKey = typeof date === "string" ? date : localDate(date);
    return state.completions.find((item) => item.profileId === state.activeProfile && item.date === dateKey && (!routineId || item.routineId === routineId));
  }

  function weeklyCompletions(date = new Date()) {
    const start = mondayOf(date);
    const end = addDays(start, 7);
    return state.completions.filter((item) => {
      if (item.profileId !== state.activeProfile) return false;
      const itemDate = parseLocalDate(item.date);
      return itemDate >= start && itemDate < end;
    });
  }

  function calculateStreak() {
    const dates = new Set(state.completions.filter((item) => item.profileId === state.activeProfile).map((item) => item.date));
    let cursor = new Date();
    if (!dates.has(localDate(cursor))) cursor = addDays(cursor, -1);
    let streak = 0;
    while (dates.has(localDate(cursor))) {
      streak += 1;
      cursor = addDays(cursor, -1);
    }
    return streak;
  }

  function formatDate(date, options = {}) {
    return new Intl.DateTimeFormat("es-ES", options).format(date);
  }

  function renderIcons(root = document) {
    root.querySelectorAll("[data-icon]").forEach((node) => { node.innerHTML = icon(node.dataset.icon); });
  }

  let customSelectSequence = 0;

  function closeCustomSelect(root, restoreFocus = false) {
    if (!root?.classList.contains("is-open")) return;
    root.classList.remove("is-open", "opens-upward");
    const trigger = root.querySelector(".custom-select-trigger");
    const popover = root.querySelector(".custom-select-popover");
    trigger?.setAttribute("aria-expanded", "false");
    if (popover) popover.hidden = true;
    if (restoreFocus) trigger?.focus({ preventScroll: true });
  }

  function closeOtherCustomSelects(exception) {
    document.querySelectorAll(".custom-select.is-open").forEach((root) => {
      if (root !== exception) closeCustomSelect(root);
    });
  }

  function enhanceSelect(select) {
    if (!(select instanceof HTMLSelectElement) || select.multiple || select.dataset.customSelect === "true") return;
    select.dataset.customSelect = "true";
    customSelectSequence += 1;
    const listboxId = `custom-select-${customSelectSequence}`;
    const field = select.closest("label");
    const fieldLabelNode = field?.querySelector(":scope > span");
    const fieldLabel = fieldLabelNode?.textContent.trim() || select.getAttribute("aria-label") || "Seleccionar una opción";
    const root = document.createElement("span");
    root.className = "custom-select";
    const trigger = document.createElement("span");
    trigger.className = "custom-select-trigger";
    trigger.tabIndex = select.disabled ? -1 : 0;
    trigger.setAttribute("role", "combobox");
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-controls", listboxId);
    trigger.innerHTML = `<span class="custom-select-value"></span><span class="custom-select-chevron">${icon("selectChevron")}</span>`;
    const popover = document.createElement("span");
    popover.className = "custom-select-popover";
    popover.id = listboxId;
    popover.hidden = true;
    popover.setAttribute("role", "listbox");
    popover.setAttribute("aria-label", fieldLabel);
    select.parentNode.insertBefore(root, select);
    root.append(select, trigger, popover);
    select.classList.add("custom-select-native");
    select.tabIndex = -1;
    select.setAttribute("aria-hidden", "true");

    const optionNodes = [];
    Array.from(select.options).forEach((option) => {
      const optionNode = document.createElement("span");
      optionNode.className = "custom-select-option";
      optionNode.dataset.value = option.value;
      optionNode.tabIndex = -1;
      optionNode.setAttribute("role", "option");
      optionNode.setAttribute("aria-disabled", String(option.disabled));
      optionNode.innerHTML = `<span>${escapeHtml(option.textContent.trim())}</span><span class="custom-select-check">${icon("check")}</span>`;
      popover.appendChild(optionNode);
      optionNodes.push(optionNode);
    });

    const sync = () => {
      const selectedOption = select.selectedOptions[0] || select.options[0];
      const selectedText = selectedOption?.textContent.trim() || "Seleccionar";
      trigger.querySelector(".custom-select-value").textContent = selectedText;
      trigger.setAttribute("aria-label", `${fieldLabel}: ${selectedText}`);
      trigger.classList.toggle("is-disabled", select.disabled);
      trigger.tabIndex = select.disabled ? -1 : 0;
      optionNodes.forEach((node) => {
        const active = node.dataset.value === select.value;
        node.classList.toggle("is-selected", active);
        node.setAttribute("aria-selected", String(active));
      });
    };

    const enabledOptions = () => optionNodes.filter((node) => node.getAttribute("aria-disabled") !== "true");
    const focusOption = (position) => {
      const options = enabledOptions();
      if (!options.length) return;
      options[Math.max(0, Math.min(position, options.length - 1))].focus({ preventScroll: true });
    };
    const open = (focusSelected = false) => {
      if (select.disabled) return;
      closeOtherCustomSelects(root);
      root.classList.add("is-open");
      popover.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      const bounds = trigger.getBoundingClientRect();
      const estimatedHeight = Math.min(272, optionNodes.length * 42 + 14);
      root.classList.toggle("opens-upward", bounds.bottom + estimatedHeight + 12 > window.innerHeight && bounds.top > estimatedHeight);
      if (focusSelected) {
        const options = enabledOptions();
        const selectedIndex = Math.max(0, options.findIndex((node) => node.classList.contains("is-selected")));
        window.requestAnimationFrame(() => focusOption(selectedIndex));
      }
    };
    const choose = (optionNode) => {
      if (!optionNode || optionNode.getAttribute("aria-disabled") === "true") return;
      select.value = optionNode.dataset.value;
      sync();
      select.dispatchEvent(new Event("change", { bubbles: true }));
      closeCustomSelect(root, true);
    };

    trigger.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (root.classList.contains("is-open")) closeCustomSelect(root, true); else open();
    });
    fieldLabelNode?.addEventListener("click", (event) => {
      event.preventDefault();
      trigger.focus({ preventScroll: true });
      open();
    });
    trigger.addEventListener("keydown", (event) => {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        open(true);
      } else if (event.key === "Escape") closeCustomSelect(root, true);
    });
    optionNodes.forEach((optionNode) => {
      optionNode.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        choose(optionNode);
      });
      optionNode.addEventListener("keydown", (event) => {
        const options = enabledOptions();
        const index = options.indexOf(optionNode);
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          focusOption(index + (event.key === "ArrowDown" ? 1 : -1));
        } else if (event.key === "Home" || event.key === "End") {
          event.preventDefault();
          focusOption(event.key === "Home" ? 0 : options.length - 1);
        } else if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          choose(optionNode);
        } else if (event.key === "Escape") {
          event.preventDefault();
          closeCustomSelect(root, true);
        } else if (event.key === "Tab") closeCustomSelect(root);
      });
    });
    select.addEventListener("input", sync);
    select.addEventListener("change", sync);
    sync();
  }

  function enhanceSelects(root = document) {
    if (root instanceof HTMLSelectElement) enhanceSelect(root);
    root.querySelectorAll?.("select").forEach(enhanceSelect);
  }

  function renderProfileChrome() {
    document.querySelectorAll("[data-profile-name]").forEach((node) => { node.textContent = profile().name; });
  }

  function renderHome() {
    const root = document.querySelector('[data-view="inicio"]');
    const now = new Date();
    const todayIndex = dayIndex(now);
    const schedule = profileSchedule();
    const todayRoutine = routine(schedule[todayIndex]);
    const todayDone = todayRoutine && completionFor(now, todayRoutine.id);
    const activeRoutine = workout ? routine(workout.routineId) : null;
    const activeProgress = workout ? WORKOUT_ENGINE.workoutProgress(workout) : null;
    const featuredRoutine = activeRoutine || todayRoutine;
    const featuredDate = activeRoutine ? workout.date : localDate(now);
    const featuredDone = !activeRoutine && todayDone;
    const latestPerformance = previousPerformance();
    const weekDone = weeklyCompletions();
    const goal = schedule.filter(Boolean).length;
    const goalProgress = goal ? Math.min(100, weekDone.length / goal * 100) : 0;
    const greeting = now.getHours() < 13 ? "Buenos días" : now.getHours() < 20 ? "Buenas tardes" : "Buenas noches";
    const todayName = formatDate(now, { weekday: "long", day: "numeric", month: "long" });
    const activeSessionSeconds = workout ? WORKOUT_ENGINE.timerSnapshot(workout.sessionTimer).elapsedSeconds : 0;
    const activeSessionResolved = Boolean(workout && (workout.readyToFinish || workout.phase === "complete"));
    const activeSessionStarted = Boolean(workout && (activeProgress.completed > 0 || activeSessionSeconds > 0 || workout.phase !== "ready"));
    const featuredAction = activeSessionResolved
      ? { icon: "check", label: "Revisar y terminar", kicker: "Sesión lista para terminar" }
      : activeSessionStarted
        ? { icon: "play", label: "Reanudar sesión", kicker: "Sesión pausada y guardada" }
        : activeRoutine
          ? { icon: "reset", label: "Empezar de nuevo", kicker: "Sesión preparada desde cero" }
          : featuredDone
            ? { icon: "reset", label: "Repetir sesión", kicker: "Sesión completada" }
            : { icon: "play", label: "Empezar sesión", kicker: "Tu sesión de hoy" };
    const featuredProgress = activeRoutine ? `<div class="home-session-progress" aria-label="Progreso de la sesión guardada">
      <div><strong>${activeProgress.completed} de ${activeProgress.total} ${workout.interval ? escapeHtml(workout.interval.roundCount ? "ejercicios" : workout.interval.unitLabel) : "series"}</strong><span>${Math.round(activeProgress.percent)} % completado</span></div>
      <div class="progress-track" role="progressbar" aria-label="Progreso del entrenamiento" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(activeProgress.percent)}"><div class="progress-fill" style="width:${activeProgress.percent}%"></div></div>
    </div>` : "";
    const preparation = featuredRoutine ? renderDisclosure({
      className: "today-preparation",
      summaryClass: "today-preparation-summary",
      summary: `<span><strong>Antes de empezar</strong><small>Revisa cargas y material guardados</small></span>`,
      content: `<p class="today-preparation-intro">Recuperaremos automáticamente tu última configuración en cada ejercicio.</p><div class="home-preparation-list">${featuredRoutine.exerciseIds.slice(0, 4).map((exerciseId) => {
        const movement = exercise(exerciseId);
        const previous = latestPerformance[exerciseId];
        const effort = effortMeta(previous?.effort);
        return `<article><span>${icon(previous ? "trend" : "dumbbell")}</span><div><strong>${escapeHtml(exerciseTitleFor(movement))}</strong><small>${previous ? `Último registro: ${escapeHtml(selectionSummary(previous.selection))}${effort ? ` · ${effort.action}` : ""}` : "Aún sin carga registrada"}</small></div></article>`;
      }).join("")}</div>`
    }) : "";
    const hero = featuredRoutine ? `
      <article class="today-card ${featuredDone ? "is-done" : ""}">
        <div class="today-copy">
          <span class="today-kicker">${icon(activeRoutine ? "activity" : featuredDone ? "check" : "sparkles")} ${featuredAction.kicker}</span>
          <h2>${escapeHtml(routineTitleFor(featuredRoutine))}</h2>
          <p>${escapeHtml(clearProseText(featuredRoutine.description))}</p>
          <div class="today-meta">
            <span>${icon("clock")} ${escapeHtml(durationFor(featuredRoutine))}</span>
            <span>${icon(featuredRoutine.kind === "hiit" ? "flame" : "dumbbell")} ${escapeHtml(routineUnitLabel(featuredRoutine))}</span>
            <span>${icon("activity")} ${escapeHtml(featuredRoutine.level)}</span>
            ${activeRoutine ? `<span>${icon("calendar")} Guardada el ${formatDate(parseLocalDate(workout.date), { weekday: "long", day: "numeric", month: "long" })}</span>` : ""}
          </div>
          ${featuredProgress}
          ${preparation}
          <button class="button ${featuredDone ? "button-secondary" : "button-accent"}" type="button" data-action="start-workout" data-routine="${featuredRoutine.id}" data-date="${featuredDate}">
            ${icon(featuredAction.icon)} ${featuredAction.label}
          </button>
        </div>
        <div class="today-visual">${exerciseMedia(exercise(featuredRoutine.exerciseIds[1] || featuredRoutine.exerciseIds[0]) || { title: routineTitleFor(featuredRoutine) })}</div>
      </article>` : `
      <article class="today-card rest-card">
        <div class="today-copy">
          <span class="today-kicker">${icon("moon")} Recuperación</span>
          <h2>Hoy toca descansar</h2>
          <p>La recuperación también forma parte de una programación coherente.</p>
        </div>
        <div class="today-visual rest-visual" aria-hidden="true"><span>${icon("moon")}</span></div>
      </article>`;

    const weekStart = mondayOf(now);
    root.innerHTML = `
      <header class="view-header">
        <div><p class="eyebrow">${escapeHtml(todayName)}</p><h1 id="inicio-title">${greeting}.</h1><p>Un paso cada vez. Tu plan está listo.</p></div>
        <button class="button button-secondary" type="button" data-action="open-profile">${icon("user")} Datos y preferencias</button>
      </header>
      <div class="hero-grid">
        ${hero}
        <aside class="consistency-card" aria-labelledby="consistency-title">
          <div class="consistency-top"><div><h2 id="consistency-title">Esta semana</h2><p>Selecciona un día para ver su rutina</p></div>${renderBadge(`${calculateStreak()} días`, { tone: "warning", iconName: "flame" })}</div>
          <div class="big-number">${weekDone.length}<span>de ${goal} sesiones</span></div>
          <div class="progress-track" role="progressbar" aria-label="Objetivo semanal" aria-valuemin="0" aria-valuemax="${Math.max(goal, 1)}" aria-valuenow="${Math.min(weekDone.length, goal)}"><div class="progress-fill" style="width:${goalProgress}%"></div></div>
          <span class="progress-caption">${!goal ? "Configura una semana para definir tu objetivo." : weekDone.length >= goal ? "Objetivo conseguido. Gran semana." : `${goal - weekDone.length} ${goal - weekDone.length === 1 ? "sesión" : "sesiones"} para completar tu objetivo.`}</span>
          <div class="week-day-list" aria-label="Plan de esta semana">
            ${DATA.days.map((day, index) => {
              const date = addDays(weekStart, index);
              const dayRoutine = routine(schedule[index]);
              const done = completionFor(date, dayRoutine?.id);
              const action = dayRoutine ? `data-action="preview-routine" data-routine="${dayRoutine.id}" data-date="${localDate(date)}"` : 'data-action="rest-info"';
              const dayLabel = dayRoutine ? routineTitleFor(dayRoutine) : "Descanso";
              const isPast = index < todayIndex;
              const statusIcon = isPast ? icon(done ? "check" : "close") : "";
              const statusLabel = done ? "Rutina completada" : isPast ? "Rutina no completada" : "Rutina pendiente";
              return `<button type="button" class="week-day-item ${done ? "is-done" : ""} ${index === todayIndex && !done ? "is-today" : ""} ${statusIcon ? "has-status" : ""}" ${action} ${index === todayIndex ? 'aria-current="date"' : ""} aria-label="${day}: ${escapeHtml(dayLabel)}. ${statusLabel}"><span class="week-day-initial" aria-hidden="true">${day.charAt(0)}</span><strong title="${escapeHtml(dayLabel)}">${escapeHtml(dayLabel)}</strong>${statusIcon ? `<span class="week-day-status" aria-hidden="true">${statusIcon}</span>` : ""}</button>`;
            }).join("")}
          </div>
          <a class="home-week-plan-link" href="#plan" data-route="plan">Ver plan completo ${icon("arrow")}</a>
        </aside>
      </div>
      <div class="section-heading"><div><h2>Claves para avanzar</h2></div></div>
      <div class="insight-grid">
        <article class="insight-card"><span class="insight-icon">${icon("activity")}</span><div class="insight-card-copy"><h3>Margen sostenible</h3><p>Termina la mayoría de series con aproximadamente 1–3 repeticiones técnicamente posibles en reserva.</p></div></article>
        <article class="insight-card"><span class="insight-icon">${icon("zap")}</span><div class="insight-card-copy"><h3>Progresa dentro de la rutina</h3><p>Completa primero el extremo superior del rango con buena técnica antes de aumentar la carga.</p></div></article>
        <article class="insight-card"><span class="insight-icon">${icon("shield")}</span><div class="insight-card-copy"><h3>Dolor no es progreso</h3><p>Detén cualquier ejercicio que produzca dolor agudo, mareo o malestar inusual.</p></div></article>
      </div>`;
  }

  function renderPlan() {
    const root = document.querySelector('[data-view="plan"]');
    const weekStart = mondayOf();
    const schedule = profileSchedule();
    const presetDisclosure = renderDisclosure({
      className: "weekly-presets",
      summaryClass: "weekly-presets-summary",
      summary: `<span class="weekly-presets-summary-icon">${icon("sparkles")}</span><span><strong>Planes semanales predefinidos</strong><small>Aplica una propuesta completa como punto de partida.</small></span>`,
      content: `<div class="weekly-preset-list">${DATA.weeklyPresets.map(renderWeeklyPresetOption).join("")}</div><p class="weekly-presets-note">El plan de alta intensidad busca aumentar el gasto energético de forma sostenible. La pérdida de peso también depende de la alimentación, el descanso y la constancia.</p>`
    });
    root.innerHTML = `
      <header class="view-header"><div><p class="eyebrow">Organización semanal</p><h1 id="plan-title">Mi plan semanal</h1><p>Revisa la rutina de cada día y ajústala directamente cuando cambien tus necesidades.</p></div><button class="button button-secondary" type="button" data-action="print">${icon("calendar")} Imprimir plan</button></header>
      ${presetDisclosure}
      <section class="selected-plan" aria-labelledby="selected-plan-title">
      <header class="selected-plan-heading"><div><p class="eyebrow">Plan actual</p><h2 id="selected-plan-title">Tu semana</h2></div><p>Cambia una rutina desde su propio día. Los días sin rutina se muestran como descanso.</p></header>
      <div class="schedule-list" aria-label="Plan de esta semana">
        ${schedule.map((routineId, index) => {
          const item = routine(routineId);
          const date = addDays(weekStart, index);
          const isToday = index === dayIndex();
          const complete = item && completionFor(date, item.id);
          if (!item) {
            return `<article class="schedule-row rest-row ${isToday ? "is-today" : ""}"><div class="schedule-day"><strong>${DATA.days[index]}</strong>${isToday ? renderBadge("Hoy", { tone: "accent" }) : `<small class="schedule-date">${formatDate(date, { day: "numeric", month: "long" })}</small>`}</div><span class="routine-icon">${icon("moon")}</span><div class="routine-copy"><h3>Descanso</h3><p>Recuperación programada; puedes convertir este día en entrenamiento cuando lo necesites.</p></div><div class="routine-actions"><button class="button button-secondary" type="button" data-action="choose-routine" data-day="${index}">Elegir rutina</button></div></article>`;
          }
          return `<article class="schedule-row ${isToday ? "is-today" : ""}">
            <div class="schedule-day"><strong>${DATA.days[index]}</strong>${isToday ? renderBadge("Hoy", { tone: "accent" }) : `<small class="schedule-date">${formatDate(date, { day: "numeric", month: "long" })}</small>`}</div>
            <span class="routine-icon">${icon(item.kind === "hiit" ? "flame" : item.kind === "cardio" ? "waves" : item.kind === "híbrida" ? "activity" : "dumbbell")}</span>
            <div class="routine-copy"><h3>${escapeHtml(routineTitleFor(item))} ${complete ? renderBadge("Completada", { tone: "success", iconName: "check" }) : ""}</h3><p>${escapeHtml(durationFor(item))} · ${escapeHtml(routineUnitLabel(item))} · ${escapeHtml(facetValues("equipment", item.equipment).join(" · "))}</p></div>
            <div class="routine-actions"><button class="button button-secondary" type="button" data-action="choose-routine" data-day="${index}">Cambiar</button><button class="button button-secondary" type="button" data-action="preview-routine" data-routine="${item.id}" data-date="${localDate(date)}">Ver rutina</button><button class="button ${complete ? "button-secondary" : "button-primary"}" type="button" data-action="start-workout" data-routine="${item.id}" data-date="${localDate(date)}">${complete ? "Repetir" : "Empezar"} ${icon("arrow")}</button></div>
          </article>`;
        }).join("")}
      </div></section>`;
  }

  function renderFacet(title, facet, options) {
    return `<section class="filter-group" aria-labelledby="filter-${facet}-title">
      <h2 id="filter-${facet}-title">${title}</h2>
      <div class="filter-pills" role="group" aria-label="${title}">
        ${options.map((option) => { const active = libraryFilters[facet] === option.value; return `<button type="button" class="filter-pill ${active ? "is-active" : ""}" data-action="toggle-exercise-filter" data-facet="${facet}" data-value="${escapeHtml(option.value)}" aria-pressed="${active}"><span>${escapeHtml(option.value)}</span>${renderNumberBadge(option.count, { tone: active ? "accent" : "neutral", label: `${option.count} resultados` })}</button>`; }).join("")}
      </div>
    </section>`;
  }

  function renderLibrary() {
    const root = document.querySelector('[data-view="biblioteca"]');
    const filterResult = PLANNER.exerciseFilterFacets(DATA.exercises, libraryFilters);
    libraryFilters.specificMuscle = filterResult.selectedSpecificMuscle;
    const results = filterResult.options.sort((first, second) => SPANISH_COLLATOR.compare(first.name, second.name));
    const appliedFilters = [libraryFilters.muscle, libraryFilters.specificMuscle, libraryFilters.equipment, libraryFilters.difficulty].filter(Boolean).length;
    root.innerHTML = `
      <header class="view-header"><div><p class="eyebrow">Biblioteca de ejercicios</p><h1 id="biblioteca-title">Ejercicios</h1><p>${DATA.exercises.length} movimientos y protocolos documentados, organizados por patrón, musculatura y equipamiento.</p></div></header>
      <div class="library-toolbar">
        <label class="search-field"><span>${icon("search")}</span><input type="search" data-library-search value="${escapeHtml(libraryFilters.query)}" placeholder="Buscar ejercicio" aria-label="Buscar ejercicios" autocomplete="off" /><button class="search-clear ${libraryFilters.query ? "is-visible" : ""}" type="button" data-action="clear-search" aria-label="Limpiar búsqueda">${icon("close")}</button></label>
        <button class="filter-toggle ${libraryFilters.panelOpen ? "is-active" : ""}" type="button" data-action="toggle-filters" aria-expanded="${libraryFilters.panelOpen}" aria-controls="exercise-filter-panel">${icon("filters")}<span>Filtros</span>${renderNumberBadge(appliedFilters, { tone: appliedFilters ? "success" : "neutral", label: `${appliedFilters} filtros aplicados` })}</button>
      </div>
      <div id="exercise-filter-panel" class="filter-panel" ${libraryFilters.panelOpen ? "" : "hidden"}>
        <div class="filter-panel-head"><div><h2>Filtrar ejercicios</h2><p>Primero delimita el grupo principal y después el músculo específico.</p></div>${appliedFilters ? `<button class="text-button" type="button" data-action="reset-filters">Limpiar ${appliedFilters === 1 ? "filtro" : "filtros"}</button>` : ""}</div>
        ${renderFacet("1. Grupo muscular principal", "muscle", filterResult.facets.muscle)}
        ${libraryFilters.muscle ? renderFacet("2. Músculo específico del grupo", "specificMuscle", filterResult.facets.specificMuscle) : `<section class="filter-group filter-group-pending"><h2>2. Músculo específico del grupo</h2><p>Selecciona primero un grupo muscular para ver únicamente sus músculos.</p></section>`}
        ${renderFacet("Equipamiento", "equipment", filterResult.facets.equipment)}
        ${renderFacet("Dificultad técnica", "difficulty", filterResult.facets.difficulty)}
      </div>
      <p class="result-count"><strong>${results.length}</strong> ${results.length === 1 ? "ejercicio encontrado" : "ejercicios encontrados"}${appliedFilters ? ` · ${appliedFilters} ${appliedFilters === 1 ? "filtro activo" : "filtros activos"}` : ""}</p>
      <div class="exercise-grid">
        ${results.map((item) => { const shownMuscle = libraryFilters.specificMuscle || item.primaryMuscles.join(" · "); const shownDifficulty = difficultyBadgeLabel(item.difficulty); return `<button class="exercise-card" type="button" data-action="view-exercise" data-exercise="${item.id}" aria-label="Abrir ficha técnica de ${escapeHtml(exerciseTitleFor(item))}">
          <span class="exercise-image">${exerciseMedia(item, "", 'loading="lazy" width="640" height="640"')}</span>
          <span class="exercise-card-body"><span class="exercise-card-topline"><small>${escapeHtml(clearSequenceText(item.pattern))}</small>${renderBadge(shownDifficulty, { tone: `difficulty-${difficultyTone(shownDifficulty)}`, className: "exercise-level-badge" })}</span><strong class="exercise-card-title">${escapeHtml(exerciseTitleFor(item))}</strong><span class="exercise-meta">${renderBadge(item.muscleGroups.join(" · "), { className: "exercise-meta-badge" })}${renderBadge(shownMuscle, { tone: libraryFilters.specificMuscle ? "primary" : "neutral", className: "exercise-meta-badge" })}${renderBadge(item.equipmentTags.join(" · "), { className: "exercise-meta-badge" })}</span><span class="card-arrow" aria-hidden="true">${icon("arrow")}</span></span>
        </button>`; }).join("")}
      </div>
      ${results.length ? "" : `<div class="empty-state"><span class="empty-icon">${icon("search")}</span><h2>Sin resultados</h2><p>Prueba con otro término o restablece los filtros para volver a ver toda la biblioteca.</p><button class="button button-secondary" type="button" data-action="reset-filters">Restablecer filtros</button></div>`}`;
  }

  function canonicalFacetValue(options, requestedValue) {
    return options.find((option) => option.value === requestedValue)?.value ?? null;
  }

  function routinePickerCatalog() {
    return Object.values(DATA.routines).map((item) => ({ ...item, searchLabel: routineTitleFor(item) }));
  }

  function renderEquipmentCard(item) {
    const variants = item.variants?.length ? `
      <section class="catalog-variants" aria-label="${escapeHtml(item.variantsLabel)}">
        <div class="catalog-subheading"><h3>${escapeHtml(item.variantsLabel)}</h3></div>
        <div class="weight-chip-list">${item.variants.map((variant) => renderBadge(`${variant}${item.unit ? ` ${item.unit}` : ""}`, { tone: "outline" })).join("")}</div>
      </section>` : "";
    const specs = item.specs?.length ? `<ul class="catalog-specs">${item.specs.map((spec) => `<li>${icon("check")} ${escapeHtml(clearEquipmentText(spec))}</li>`).join("")}</ul>` : "";
    const accessories = item.accessories?.length ? `
      <section class="catalog-accessories" aria-label="Acoples incluidos">
        <div class="catalog-subheading"><h3>Acoples incluidos</h3>${renderNumberBadge(item.accessories.length, { tone: "primary", label: `${item.accessories.length} acoples` })}</div>
        <div class="bench-attachment-grid">${item.accessories.map((accessory) => `
          <article class="bench-attachment">
            <span class="bench-attachment-image"><img src="${accessory.image}" alt="${escapeHtml(equipmentNameFor(accessory))}" loading="lazy" width="900" height="900" /></span>
            <span class="bench-attachment-copy"><strong>${escapeHtml(equipmentNameFor(accessory))}</strong><small>${escapeHtml(clearEquipmentText(accessory.detail))}</small></span>
          </article>`).join("")}</div>
      </section>` : "";
    return `<article class="catalog-card catalog-card-${item.id}">
      <figure class="catalog-image"><img src="${item.image}" alt="${escapeHtml(equipmentNameFor(item))}" loading="lazy" width="1200" height="1200" /></figure>
      <div class="catalog-card-body">
        <div class="catalog-card-topline"><span>${escapeHtml(item.category)}</span>${renderBadge(`${item.quantity} ${item.quantity === 1 ? "unidad" : "unidades"}`, { tone: "primary" })}</div>
        <h2>${escapeHtml(equipmentNameFor(item))}</h2>
        <p>${escapeHtml(clearProseText(item.description))}</p>
        <div class="catalog-detail">${icon(item.icon)}<strong>${escapeHtml(clearEquipmentText(item.detail))}</strong></div>
        ${variants}${specs}${accessories}
        <div class="catalog-safety">${icon("shield")}<span>${escapeHtml(clearProseText(item.note))}</span></div>
      </div>
    </article>`;
  }

  function renderEquipment() {
    const root = document.querySelector('[data-view="equipamiento"]');
    const mainItems = DATA.equipment.filter((item) => item.selection?.type !== "band");
    const bandsItem = DATA.equipment.find((item) => item.selection?.type === "band");
    const mainUnits = DATA.equipment.reduce((sum, item) => sum + item.quantity, 0);
    const benchAccessoryUnits = DATA.equipment.reduce((sum, item) => sum + (item.accessories?.reduce((accessorySum, accessory) => accessorySum + (accessory.quantity || 1), 0) || 0), 0);
    const bandAccessoryUnits = DATA.equipmentAccessories.reduce((sum, item) => sum + item.quantity, 0);
    const totalUnits = mainUnits + benchAccessoryUnits + bandAccessoryUnits;
    const totalVariants = DATA.equipment.reduce((sum, item) => sum + (item.variants?.length || 0), 0) + DATA.bands.length;
    root.innerHTML = `
      <header class="view-header equipment-view-header">
        <div><p class="eyebrow">Inventario disponible</p><h1 id="equipamiento-title">Equipamiento disponible</h1><p>Catálogo visual del material real, sus cantidades y todas las variantes de carga disponibles.</p></div>
        <a class="button button-secondary" href="#biblioteca" data-route="biblioteca">${icon("library")} Ver ejercicios</a>
      </header>
      <section class="inventory-summary" aria-label="Resumen del inventario">
        <div class="inventory-summary-copy"><span>${icon("dumbbell")}</span><div><strong>Material confirmado</strong><small>No se presupone equipo que no esté en esta lista.</small></div></div>
        <dl><div><dt>Familias</dt><dd>${DATA.equipment.length}</dd></div><div><dt>Piezas</dt><dd>${totalUnits}</dd></div><div><dt>Configuraciones</dt><dd>${totalVariants}</dd></div></dl>
      </section>
      <div class="catalog-grid">${mainItems.map(renderEquipmentCard).join("")}</div>
      <section class="band-catalog" aria-labelledby="bands-title">
        <div class="band-catalog-visual">
          <img src="${bandsItem.image}" alt="${escapeHtml(equipmentNameFor(bandsItem))}" loading="lazy" width="1200" height="676" />
          <div><p class="eyebrow">${escapeHtml(bandsItem.category)}</p><h2 id="bands-title">${escapeHtml(equipmentNameFor(bandsItem))}</h2><p>${escapeHtml(clearProseText(bandsItem.description))}</p>${renderBadge(`${bandsItem.quantity} bandas en total`, { tone: "primary" })}</div>
        </div>
        <div class="band-table-wrap">
          <table class="band-table">
            <caption class="sr-only">Resistencia y cantidad de cada Rogue Monster Band</caption>
            <thead><tr><th scope="col">Banda</th><th scope="col">Resistencia</th><th scope="col">Cantidad</th></tr></thead>
            <tbody>${DATA.bands.map((band) => `<tr><th scope="row"><i style="--band-color:${band.swatch}" aria-hidden="true"></i><span><strong>${escapeHtml(band.color)}</strong></span></th><td><strong>${band.pounds} libras</strong><small>≈ ${escapeHtml(band.kgf)} kgf</small></td><td>${renderNumberBadge(band.quantity, { tone: "primary", label: `${band.quantity} ${band.quantity === 1 ? "unidad" : "unidades"}` })}</td></tr>`).join("")}</tbody>
          </table>
        </div>
        <footer class="band-catalog-footer"><div class="catalog-safety">${icon("shield")}<span>${escapeHtml(clearProseText(bandsItem.note))}</span></div></footer>
      </section>
      <section class="accessory-section" aria-labelledby="accessories-title">
        <div class="accessory-heading"><span>${icon("package")}</span><div><p class="eyebrow">Accesorios para bandas</p><h2 id="accessories-title">Accesorios disponibles</h2></div></div>
        <div class="accessory-grid">${DATA.equipmentAccessories.map((item) => `<article class="band-accessory-card">
          <figure><img src="${item.image}" alt="${escapeHtml(item.imageAlt)}" loading="lazy" width="1400" height="1050" />${renderBadge(`${item.quantity} ${item.quantity === 1 ? "unidad" : "unidades"}`, { tone: "accent", className: "accessory-quantity-badge" })}</figure>
          <div><strong>${escapeHtml(equipmentNameFor(item))}</strong><small>${escapeHtml(clearEquipmentText(item.detail))}</small></div>
        </article>`).join("")}</div>
        <section class="anchor-catalog" aria-labelledby="anchor-options-title">
          <div class="anchor-catalog-heading"><div><p class="eyebrow">Complementos de montaje</p><h3 id="anchor-options-title">${escapeHtml(DATA.bandMounting.title)}</h3></div>${renderBadge(DATA.bandMounting.summary, { tone: "accent", iconName: "anchor" })}</div>
          <p class="anchor-intro">${escapeHtml(DATA.bandMounting.intro)}</p>
          <div class="anchor-option-grid">${DATA.bandAnchors.map((item) => `<article>
            <span class="anchor-option-icon">${icon(item.icon)}</span>
            <div><small>${escapeHtml(item.position)}</small><strong>${escapeHtml(equipmentNameFor(item))}</strong><p>${escapeHtml(clearEquipmentText(item.detail))}</p></div>
          </article>`).join("")}</div>
          <div class="anchor-guidance">${icon("shield")}<p><strong>${escapeHtml(DATA.bandMounting.guidanceTitle)}</strong> ${escapeHtml(DATA.bandMounting.guidance)}</p></div>
        </section>
      </section>`;
  }

  function lastEightWeeks() {
    const current = mondayOf();
    return Array.from({ length: 8 }, (_, index) => {
      const start = addDays(current, (index - 7) * 7);
      const end = addDays(start, 7);
      const count = state.completions.filter((item) => {
        const date = parseLocalDate(item.date);
        return item.profileId === state.activeProfile && date >= start && date < end;
      }).length;
      return { start, count, current: index === 7 };
    });
  }

  function progressRecords() {
    return state.completions
      .filter((item) => item.profileId === state.activeProfile)
      .sort((first, second) => String(second.completedAt || second.date).localeCompare(String(first.completedAt || first.date)));
  }

  function normalizeSearch(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").trim();
  }

  function completionSeconds(record) {
    const measured = Number(record?.sessionDurationSeconds);
    return Number.isFinite(measured) && measured > 0 ? Math.round(measured) : Math.max(60, Math.round(Number(record?.duration || 0) * 60));
  }

  function formatAccumulatedDuration(seconds) {
    const value = Math.max(0, Math.round(Number(seconds) || 0));
    if (!value) return "0 min";
    if (value < 3600) return formatDuration(value);
    const hours = Math.floor(value / 3600);
    const minutes = Math.floor(value % 3600 / 60);
    return `${hours} h${minutes ? ` ${minutes} min` : ""}`;
  }

  function completionExerciseCount(record) {
    const measured = Number(record?.exercises);
    if (Number.isFinite(measured) && measured >= 0) return Math.round(measured);
    return (record?.performance || []).length;
  }

  function protocolVariantLabel(record, routineItem) {
    if (!record?.protocolVariantId || !routineItem?.protocol?.variants) return "";
    return routineItem.protocol.variants.find((variant) => variant.id === record.protocolVariantId)?.label || "";
  }

  function completionMatchesSearch(record, query) {
    if (!query) return true;
    const routineItem = routine(record.routineId);
    const searchable = [
      routineTitleFor(routineItem),
      routineItem?.description,
      record.date,
      protocolVariantLabel(record, routineItem),
      ...(record.performance || []).flatMap((entry) => [exerciseTitleFor(exercise(entry.exerciseId)), entry.notes, selectionSummary(entry.selection)])
    ];
    return normalizeSearch(searchable.join(" ")).includes(query);
  }

  function filteredProgressRecords(records) {
    const today = new Date();
    const cutoff = progressFilters.range === "eight-weeks"
      ? addDays(mondayOf(today), -49)
      : progressFilters.range === "year"
        ? new Date(today.getFullYear() - 1, today.getMonth(), today.getDate())
        : null;
    const query = normalizeSearch(progressFilters.query);
    return records.filter((record) => (!cutoff || parseLocalDate(record.date) >= cutoff) && completionMatchesSearch(record, query));
  }

  function renderCompletionFacts(record) {
    const routineItem = routine(record.routineId);
    const completedSets = (record.performance || []).flatMap((entry) => entry.sets || []).filter((set) => set.completed).length;
    const exercises = completionExerciseCount(record);
    const plannedSeconds = Math.max(60, Number(record.plannedSeconds) || Number(record.plannedMinutes) * 60 || routineItem?.estimatedMinutes * 60 || 60);
    const variant = protocolVariantLabel(record, routineItem);
    const completedAt = new Date(record.completedAt);
    const completedTime = Number.isFinite(completedAt.getTime()) ? formatDate(completedAt, { hour: "2-digit", minute: "2-digit" }) : "No registrada";
    return `<dl class="session-facts">
      <div><dt>Trabajo guardado</dt><dd>${exercises} ${exercises === 1 ? "ejercicio" : "ejercicios"}${completedSets ? ` · ${completedSets} ${completedSets === 1 ? "serie" : "series"}` : ""}</dd></div>
      <div><dt>Duración prevista</dt><dd>${formatDuration(plannedSeconds)}</dd></div>
      ${variant ? `<div><dt>Duración elegida</dt><dd>${escapeHtml(variant)}</dd></div>` : ""}
      <div><dt>Hora de finalización</dt><dd>${escapeHtml(completedTime)}</dd></div>
    </dl>`;
  }

  function renderCompletion(record) {
    const routineItem = routine(record.routineId);
    const date = formatDate(parseLocalDate(record.date), { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    const details = renderPerformanceDetails(record);
    const content = `${renderCompletionFacts(record)}${details || `<p class="legacy-session-note">Esta sesión no incluye resultados por ejercicio porque procede de una versión anterior de la aplicación.</p>`}`;
    return renderDisclosure({
      className: "history-session",
      summaryClass: "history-item",
      summary: `<span class="history-check">${icon("check")}</span><span><strong>${escapeHtml(routineTitleFor(routineItem))}</strong><small>${escapeHtml(date)}</small></span><span class="history-time">${formatDuration(completionSeconds(record))}</span>`,
      content
    });
  }

  function renderProgress() {
    const root = document.querySelector('[data-view="progreso"]');
    const all = progressRecords();
    const filtered = filteredProgressRecords(all);
    const visibleRecords = filtered.slice(0, progressFilters.visible);
    const weeks = lastEightWeeks();
    const max = Math.max(4, ...weeks.map((item) => item.count));
    const done = weeklyCompletions().length;
    const goal = profileSchedule().filter(Boolean).length;
    const uniqueDays = new Set(all.map((item) => item.date)).size;
    const trainedSeconds = all.reduce((sum, item) => sum + completionSeconds(item), 0);
    root.innerHTML = `
      <header class="view-header"><div><p class="eyebrow">Tu recorrido</p><h1 id="progreso-title">Progreso</h1><p>Cada sesión terminada en el reproductor queda registrada, esté o no incluida en tu plan semanal.</p></div><button class="button button-secondary" type="button" data-action="export-data">${icon("export")} Exportar copia</button></header>
      <section class="progress-summary" aria-label="Resumen de progreso">
        <article><span>${icon("check")}</span><div><strong>${all.length}</strong><small>Sesiones completadas</small></div></article>
        <article><span>${icon("clock")}</span><div><strong>${formatAccumulatedDuration(trainedSeconds)}</strong><small>Tiempo entrenado</small></div></article>
        <article><span>${icon("calendar")}</span><div><strong>${uniqueDays}</strong><small>Días con actividad</small></div></article>
        <article><span>${icon("flame")}</span><div><strong>${calculateStreak()}</strong><small>Días de racha actual</small></div></article>
      </section>
      <div class="progress-hero">
        <article class="chart-card"><div class="chart-head"><div><h2>Actividad en 8 semanas</h2><p>Todas las sesiones guardadas por semana</p></div><div class="chart-total"><strong>${weeks.reduce((sum, item) => sum + item.count, 0)}</strong><small>en este periodo</small></div></div><div class="bar-chart" aria-label="Sesiones de las últimas ocho semanas">${weeks.map((item) => { const fullDate = formatDate(item.start, { day: "numeric", month: "long" }); return `<div class="bar-column"><div class="bar ${item.current ? "is-current" : ""}" style="height:${Math.max(2, item.count / max * 100)}%" data-value="${item.count} ${item.count === 1 ? "sesión" : "sesiones"}"></div><span aria-label="Semana del ${escapeHtml(fullDate)}" title="Semana del ${escapeHtml(fullDate)}"><span class="bar-date-full" aria-hidden="true">${escapeHtml(fullDate)}</span><span class="bar-date-compact" aria-hidden="true">${formatDate(item.start, { day: "numeric" })}</span></span></div>`; }).join("")}</div></article>
        <article class="goal-card"><h2>Objetivo semanal</h2><div class="goal-ring" style="--goal-angle:${goal ? Math.min(360, done / goal * 360) : 0}deg"><span>${done} de ${goal}</span></div><p>${!goal ? "Asigna rutinas a tu semana para definir un objetivo." : done >= goal ? "Objetivo alcanzado. Todas las sesiones completadas cuentan, incluidas las no planificadas." : `Te faltan ${goal - done} ${goal - done === 1 ? "sesión" : "sesiones"}. También cuentan las rutinas que elijas en el momento.`}</p></article>
      </div>
      <article class="history-card">
        <div class="history-heading"><div><h2>Historial de sesiones</h2><p>Consulta cargas, repeticiones, esfuerzo y notas guardadas.</p></div>${renderBadge(`${filtered.length} ${filtered.length === 1 ? "resultado" : "resultados"}`, { tone: "primary" })}</div>
        ${all.length ? `<div class="progress-toolbar">
          <label class="search-field"><span>${icon("search")}</span><input type="search" data-progress-search value="${escapeHtml(progressFilters.query)}" placeholder="Buscar rutina, ejercicio o nota" aria-label="Buscar en el historial" autocomplete="off" /><button class="search-clear ${progressFilters.query ? "is-visible" : ""}" type="button" data-action="clear-progress-search" aria-label="Limpiar búsqueda">${icon("close")}</button></label>
          <label class="progress-range"><span>Periodo</span><select data-progress-range aria-label="Periodo del historial"><option value="all" ${progressFilters.range === "all" ? "selected" : ""}>Todo el historial</option><option value="eight-weeks" ${progressFilters.range === "eight-weeks" ? "selected" : ""}>Últimas 8 semanas</option><option value="year" ${progressFilters.range === "year" ? "selected" : ""}>Últimos 12 meses</option></select></label>
        </div>${filtered.length ? `<div class="history-list">${visibleRecords.map(renderCompletion).join("")}</div>${visibleRecords.length < filtered.length ? `<button class="button button-secondary history-load-more" type="button" data-action="load-more-progress">Mostrar más sesiones</button>` : ""}` : `<div class="empty-state empty-state-compact"><span class="empty-icon">${icon("search")}</span><h2>Sin resultados</h2><p>No hay sesiones que coincidan con la búsqueda y el periodo seleccionados.</p><button class="button button-secondary" type="button" data-action="reset-progress-filters">Restablecer búsqueda</button></div>`}` : `<div class="empty-state"><span class="empty-icon">${icon("trend")}</span><h2>Tu progreso empieza aquí</h2><p>Completa cualquier rutina con el reproductor para guardar su duración, resultados y esfuerzo, aunque no forme parte del plan semanal.</p><a class="button button-primary" href="#inicio" data-route="inicio">Ir a mi sesión</a></div>`}
      </article>`;
  }

  function renderAll() {
    renderProfileChrome();
    renderHome();
    renderPlan();
    renderLibrary();
    renderEquipment();
    renderProgress();
    renderIcons();
    enhanceSelects();
  }

  function navigate(nextRoute, updateHash = true) {
    route = ROUTES.includes(nextRoute) ? nextRoute : "inicio";
    document.querySelectorAll("[data-view]").forEach((view) => {
      const active = view.dataset.view === route;
      view.hidden = !active;
      view.classList.toggle("is-active", active);
    });
    document.querySelectorAll("[data-route]").forEach((link) => {
      const active = link.dataset.route === route;
      link.classList.toggle("is-active", active);
      if (link.classList.contains("nav-link")) active ? link.setAttribute("aria-current", "page") : link.removeAttribute("aria-current");
    });
    if (updateHash && location.hash !== `#${route}`) history.pushState(null, "", `#${route}`);
    document.title = `${route === "inicio" ? "Inicio" : route.charAt(0).toUpperCase() + route.slice(1)} — Entrenamiento`;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openDialog(dialog) {
    if (!dialog) return;
    if (dialog.open || dialog.hasAttribute("open")) return;
    if (typeof dialog.showModal === "function") dialog.showModal(); else dialog.setAttribute("open", "");
    document.body.classList.add("dialog-open");
  }

  function closeDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.close === "function" && dialog.open) dialog.close(); else dialog.removeAttribute("open");
    if (dialog.id === "confirm-dialog") {
      pendingReset = false;
      pendingWeeklyPreset = null;
      pendingWorkoutStart = null;
    }
    if (dialog.id === "exercise-dialog") routinePickerPreviewDay = null;
    if (!document.querySelector("dialog[open]")) document.body.classList.remove("dialog-open");
  }

  function openRoutinePicker(day) {
    const dayNumber = Number(day);
    if (!Number.isInteger(dayNumber) || dayNumber < 0 || dayNumber > 6) return;
    if (routinePickerFilters.day !== dayNumber) routinePickerFilters = emptyRoutinePickerFilters(dayNumber);
    routinePickerPreviewDay = null;
    detailContext = null;
    const dialog = document.getElementById("exercise-dialog");
    const schedule = profileSchedule();
    const current = schedule[dayNumber];
    const planDate = localDate(addDays(mondayOf(), dayNumber));
    const allOptions = routinePickerCatalog().sort((first, second) => {
      const libraryOrder = Number(first.library === "hiit") - Number(second.library === "hiit");
      return libraryOrder || SPANISH_COLLATOR.compare(first.id, second.id);
    });
    const facets = PLANNER.routineFilterFacets(allOptions, routinePickerFilters);
    Object.assign(routinePickerFilters, facets.selected);
    const visibleFacets = PLANNER.routineFacets.filter((facet) => facets.facets[facet].length);
    const filterSections = visibleFacets.map((facet, index) => {
      const options = [...facets.facets[facet]].sort((first, second) => SPANISH_COLLATOR.compare(PLANNER.routineFacetLabel(facet, first.value), PLANNER.routineFacetLabel(facet, second.value)));
      return `<section class="filter-group" aria-labelledby="routine-${facet}-filter-title"><h2 id="routine-${facet}-filter-title">${index + 1}. ${escapeHtml(PLANNER.routineFacetTitles[facet])}</h2><p class="routine-filter-description">${escapeHtml(ROUTINE_FILTER_DESCRIPTIONS[facet])}</p><div class="filter-pills" role="group" aria-label="Filtrar por ${escapeHtml(PLANNER.routineFacetTitles[facet])}">${options.map((option) => { const active = routinePickerFilters[facet] === option.value; return `<button type="button" class="filter-pill ${active ? "is-active" : ""}" data-action="filter-routine" data-facet="${facet}" data-day="${dayNumber}" data-value="${escapeHtml(option.value)}" aria-pressed="${active}"><span>${escapeHtml(PLANNER.routineFacetLabel(facet, option.value))}</span>${renderNumberBadge(option.count, { tone: active ? "accent" : "neutral", label: `${option.count} resultados` })}</button>`; }).join("")}</div></section>`;
    }).join("");
    const activeFilterCount = PLANNER.routineFacets.filter((facet) => routinePickerFilters[facet]).length;
    const emptyOptions = `<div class="empty-state"><span class="empty-icon">${icon("search")}</span><h2>Sin resultados</h2><p>Prueba con otro término o restablece los filtros para volver a ver las rutinas disponibles.</p></div>`;
    dialog.innerHTML = `<div class="dialog-scroll" data-dialog-scroll><header class="dialog-header"><div><p>${escapeHtml(DATA.days[dayNumber])} · Rutinas generales e intervalos de alta intensidad</p><h2 id="exercise-dialog-title">Elegir rutina</h2></div><button type="button" class="icon-button dialog-close" data-action="close-dialog" aria-label="Cerrar">${icon("close")}</button></header><div class="dialog-body"><div class="library-toolbar routine-picker-toolbar"><label class="search-field"><span>${icon("search")}</span><input type="search" data-routine-search data-day="${dayNumber}" value="${escapeHtml(routinePickerFilters.query)}" placeholder="Buscar rutina" aria-label="Buscar rutinas" autocomplete="off" /><button class="search-clear ${routinePickerFilters.query ? "is-visible" : ""}" type="button" data-action="clear-routine-search" data-day="${dayNumber}" aria-label="Limpiar búsqueda">${icon("close")}</button></label><button class="filter-toggle ${routinePickerFilters.panelOpen ? "is-active" : ""}" type="button" data-action="toggle-routine-filters" data-day="${dayNumber}" aria-expanded="${routinePickerFilters.panelOpen}" aria-controls="routine-filter-panel">${icon("filters")}<span>Filtros</span>${renderNumberBadge(activeFilterCount, { tone: activeFilterCount ? "success" : "neutral", label: `${activeFilterCount} filtros aplicados` })}</button></div><div id="routine-filter-panel" class="filter-panel routine-picker-filter-panel" ${routinePickerFilters.panelOpen ? "" : "hidden"}><div class="filter-panel-head"><div><h2>Filtrar rutinas</h2><p>Elige el tipo de rutina y concreta después el objetivo, la zona corporal, el material o el formato.</p></div>${activeFilterCount ? `<button class="text-button" type="button" data-action="reset-routine-filters" data-day="${dayNumber}">Limpiar ${activeFilterCount === 1 ? "filtro" : "filtros"}</button>` : ""}</div>${filterSections}</div><p class="result-count routine-picker-count"><strong>${facets.options.length}</strong> ${facets.options.length === 1 ? "rutina encontrada" : "rutinas encontradas"}${activeFilterCount ? ` · ${activeFilterCount} ${activeFilterCount === 1 ? "filtro activo" : "filtros activos"}` : ""}</p><div class="routine-picker-list">${facets.options.length ? facets.options.map((item) => { const title = routineTitleFor(item); const subtitle = clearProseText(item.description); return `<article class="routine-picker-item ${current === item.id ? "is-selected" : ""}"><h3 title="${escapeHtml(title)}">${escapeHtml(title)}</h3><p title="${escapeHtml(subtitle)}">${escapeHtml(subtitle)}</p><div class="exercise-meta" aria-label="Datos principales de la rutina">${renderBadge(PLANNER.routineFacetLabel("library", item.library))}${renderBadge(item.level)}${renderBadge(durationFor(item))}</div><div class="routine-picker-actions"><button class="button button-secondary" type="button" data-action="preview-picker-routine" data-day="${dayNumber}" data-routine="${item.id}" data-date="${planDate}">Ver rutina</button><button class="button ${current === item.id ? "button-secondary" : "button-primary"}" type="button" data-action="assign-routine" data-day="${dayNumber}" data-routine="${item.id}">${current === item.id ? "Seleccionada" : "Elegir"}</button></div></article>`; }).join("") : emptyOptions}</div></div><footer class="dialog-footer"><button class="button button-secondary" type="button" data-action="assign-rest" data-day="${dayNumber}">${icon("moon")} Marcar descanso</button><button class="button button-secondary" type="button" data-action="close-dialog">Cancelar</button></footer></div>`;
    openDialog(dialog);
    resetDialogScroll(dialog);
  }

  function previewRoutine(routineId, date = localDate(), preserveContext = false) {
    const item = routine(routineId);
    if (!item) return;
    const session = routineSession(item);
    if (!preserveContext) detailContext = { routineId, date };
    const dialog = document.getElementById("exercise-dialog");
    const fromPicker = Number.isInteger(routinePickerPreviewDay);
    const referenceRows = item.protocol
      ? item.exerciseIds.map((exerciseId, index) => { const movement = exercise(exerciseId); return `<button class="routine-exercise-row is-reference" type="button" data-action="view-routine-exercise" data-exercise="${movement.id}"><span class="history-check">${index + 1}</span><span><strong>${escapeHtml(exerciseTitleFor(movement))}</strong></span>${icon("chevron")}</button>`; }).join("")
      : session.items.map((row, index) => { const movement = exercise(row.exerciseId); return `<button class="routine-exercise-row" type="button" data-action="view-routine-exercise" data-exercise="${movement.id}"><span class="history-check">${index + 1}</span><span><strong>${escapeHtml(exerciseTitleFor(movement))}</strong><small>${escapeHtml(clearSequenceText(row.prescription))}${row.optional ? " · Opcional" : ""}</small></span>${icon("chevron")}</button>`; }).join("");
    const movementCount = item.protocol ? item.exerciseIds.length : session.items.length;
    const sessionFacts = [
      ["Duración", durationFor(item)],
      ["Nivel", item.level]
    ];
    const structureSteps = item.protocol ? protocolStructureSteps(session) : [];
    const structureFact = structureSteps.length ? `<li class="routine-preview-structure"><strong>Estructura</strong><ol>${structureSteps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol></li>` : "";
    const protocol = `<section class="routine-preview-protocol ${item.protocol ? "" : "is-summary"}">${icon(item.library === "hiit" ? "zap" : "info")}<div><small>${item.protocol ? "Protocolo de la sesión" : "Datos de la sesión"}</small><ul class="routine-preview-facts">${sessionFacts.map(([label, value]) => `<li><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></li>`).join("")}${structureFact}</ul></div></section>`;
    const breakdown = item.durationBreakdown ? `<section class="routine-duration-breakdown" aria-labelledby="routine-duration-title"><div class="detail-section-heading"><h3 id="routine-duration-title">${icon("clock")} Distribución del tiempo</h3>${renderBadge(`${item.durationBreakdown.variantLabel} · ${formatDuration(item.durationBreakdown.totalSeconds)}`, { tone: "primary" })}</div><dl><div><dt>Calentamiento</dt><dd>${formatDuration(item.durationBreakdown.warmupSeconds)}</dd></div><div><dt>Bloque principal</dt><dd>${formatDuration(item.durationBreakdown.mainSeconds)}</dd></div><div><dt>Trabajo efectivo</dt><dd>${formatDuration(item.durationBreakdown.workSeconds)}</dd></div><div><dt>Pausas y cambios</dt><dd>${formatDuration(item.durationBreakdown.recoverySeconds)}</dd></div><div><dt>Vuelta a la calma</dt><dd>${formatDuration(item.durationBreakdown.cooldownSeconds)}</dd></div></dl></section>` : "";
    const preparationSections = [
      item.warmup ? `<section><h4>Calentamiento</h4><p>${escapeHtml(clearProseText(item.warmup))}</p></section>` : "",
      item.logistics ? `<section><h4>Descansos y material</h4><p>${escapeHtml(clearSequenceText(item.logistics))}</p></section>` : "",
      item.safety ? `<section><h4>Seguridad</h4><p>${escapeHtml(clearProseText(item.safety))}</p></section>` : ""
    ].filter(Boolean).join("");
    const preparation = preparationSections ? renderDisclosure({ className: "routine-preview-details", summary: "Preparación antes de empezar", content: preparationSections }) : "";
    const equipmentRefs = item.equipmentRefs;
    const equipmentItems = equipmentRefs.map((ref) => equipmentReferenceButton(item, ref, { context: "routine" })).join("");
    const equipmentSection = equipmentItems ? `<section class="detail-section detail-equipment-section routine-preview-equipment" aria-labelledby="routine-equipment-title"><div class="detail-section-heading"><h3 id="routine-equipment-title">${icon("dumbbell")} Equipamiento utilizado</h3>${renderNumberBadge(equipmentRefs.length, { tone: "primary", label: `${equipmentRefs.length} elementos de equipamiento` })}</div><div class="detail-equipment-list">${equipmentItems}</div></section>` : "";
    const exerciseList = referenceRows ? `<section class="routine-preview-exercises"><header><h3>${item.protocol ? "Ejercicios del protocolo" : "Ejercicios"}</h3>${renderNumberBadge(movementCount, { tone: "primary", label: `${movementCount} ejercicios` })}</header><div class="routine-exercise-list">${referenceRows}</div></section>` : "";
    const pickerBack = fromPicker ? `<button class="back-button routine-picker-back" type="button" data-action="back-to-routine-picker">${icon("back")}<span>Volver a elegir rutina</span></button>` : "";
    const footerAction = fromPicker
      ? `<button class="button button-primary" type="button" data-action="assign-routine" data-day="${routinePickerPreviewDay}" data-routine="${item.id}">Elegir rutina ${icon("check")}</button>`
      : `<button class="button button-primary" type="button" data-action="start-workout" data-routine="${item.id}" data-date="${escapeHtml(date)}">Empezar rutina ${icon("arrow")}</button>`;
    dialog.innerHTML = `<div class="dialog-scroll routine-preview" data-dialog-scroll><header class="dialog-header routine-preview-header"><div class="routine-preview-title">${pickerBack}<h2 id="exercise-dialog-title">${escapeHtml(routineTitleFor(item))}</h2></div><button type="button" class="icon-button dialog-close" data-action="close-dialog" aria-label="Cerrar">${icon("close")}</button></header><div class="dialog-body routine-preview-body">${protocol}${breakdown}${equipmentSection}${exerciseList}${preparation}</div><footer class="dialog-footer routine-preview-footer">${footerAction}</footer></div>`;
    openDialog(dialog);
    resetDialogScroll(dialog);
  }

  function resetDialogScroll(dialog) {
    const scroller = dialog?.querySelector("[data-dialog-scroll]");
    if (scroller) scroller.scrollTop = 0;
  }

  function equipmentReferenceButton(item, ref, { context = "exercise" } = {}) {
    const record = equipmentRecord(ref);
    if (!record) return "";
    const isAnchor = ref.kind === "anchor";
    const visual = isAnchor
      ? `<span>${icon("anchor")}</span>`
      : record.image
      ? `<img src="${record.image}" alt="" loading="lazy" width="160" height="160" />`
      : `<span>${icon(record.icon || "package")}</span>`;
    const contextData = context === "routine" ? `data-action="view-routine-equipment" data-routine="${item.id}"` : `data-action="view-exercise-equipment" data-exercise="${item.id}"`;
    return `<button class="detail-equipment-item" type="button" ${contextData} data-equipment-kind="${ref.kind}" data-equipment-id="${ref.id}" aria-label="Ver ficha de ${escapeHtml(equipmentNameFor(record))}">
      <span class="detail-equipment-thumb ${isAnchor ? "is-anchor" : ""}">${visual}</span>
      <span class="detail-equipment-copy"><small>${escapeHtml(clearProseText(record.label))}</small><strong>${escapeHtml(equipmentNameFor(record))}</strong><span>${escapeHtml(clearEquipmentText(record.detail || record.description))}</span></span>
      ${icon("chevron")}
    </button>`;
  }

  function showExercise(exerciseId, returnFocus = false, preserveContext = false) {
    const item = exercise(exerciseId);
    if (!item) return;
    if (!preserveContext) detailContext = null;
    const dialog = document.getElementById("exercise-dialog");
    const equipmentItems = item.equipmentRefs.map((ref) => equipmentReferenceButton(item, ref)).join("");
    dialog.innerHTML = `<div class="dialog-scroll detail-dialog-scroll" data-dialog-scroll>
      ${detailContext?.routineId ? `<header class="dialog-header equipment-modal-header"><button class="back-button" type="button" data-action="back-to-routine">${icon("back")}<span>Volver a la rutina</span></button><button type="button" class="icon-button dialog-close" data-action="close-dialog" aria-label="Cerrar">${icon("close")}</button></header>` : ""}
      <div class="exercise-detail-hero">${exerciseMedia(item, `Referencia de ${exerciseTitleFor(item)}`)}${detailContext?.routineId ? "" : `<button type="button" class="icon-button dialog-close" data-action="close-dialog" aria-label="Cerrar">${icon("close")}</button>`}</div>
      <div class="dialog-body"><div class="detail-title"><p class="eyebrow">${escapeHtml(clearProseText(item.category))} · ${escapeHtml(item.difficulty)}</p><h2 id="exercise-dialog-title">${escapeHtml(exerciseTitleFor(item))}</h2><p>${escapeHtml(clearSequenceText(item.pattern))}</p><div class="exercise-meta">${renderBadge(`Zona corporal: ${item.muscleGroups.join(" · ")}`)}${renderBadge(`Músculos principales: ${item.primaryMuscles.join(" · ")}`)}${item.secondaryMuscles.length ? renderBadge(`Músculos secundarios: ${item.secondaryMuscles.join(" · ")}`) : ""}${renderBadge(`Equipamiento: ${clearEquipmentText(item.equipment)}`)}${renderBadge(`Dosificación: ${clearSequenceText(item.dose)}`)}</div></div>
      <section class="detail-section detail-equipment-section" aria-labelledby="exercise-equipment-title"><div class="detail-section-heading"><h3 id="exercise-equipment-title">${icon("dumbbell")} Equipamiento utilizado</h3>${renderNumberBadge(item.equipmentRefs.length, { tone: "primary", label: `${item.equipmentRefs.length} elementos de equipamiento` })}</div><div class="detail-equipment-list">${equipmentItems}</div></section>
      <section class="detail-section"><h3>${icon("sparkles")} Clave técnica</h3><p>${escapeHtml(clearProseText(item.cue))}</p></section><section class="detail-section"><h3>${icon("calendar")} Paso a paso</h3><ol>${item.steps.map((step) => `<li>${escapeHtml(clearProseText(step))}</li>`).join("")}</ol></section><section class="detail-section"><div class="safety-box">${icon("shield")}<div><h3>Técnica, progresión y seguridad</h3><p>${escapeHtml(clearProseText(item.safety))}</p></div></div></section></div>
    </div>`;
    openDialog(dialog);
    resetDialogScroll(dialog);
    if (returnFocus) dialog.querySelector('[data-action="view-exercise-equipment"]')?.focus({ preventScroll: true });
  }

  function showEquipmentDetail(ref, { exerciseId = null, returnToRoutine = false } = {}) {
    const movement = exerciseId ? exercise(exerciseId) : null;
    const item = equipmentRecord(ref);
    if ((!movement && !returnToRoutine) || !item) return;
    const dialog = document.getElementById("exercise-dialog");
    const visual = item.image
      ? `<figure class="modal-equipment-visual"><img src="${item.image}" alt="${escapeHtml(equipmentNameFor(item))}" width="1200" height="1200" /></figure>`
      : `<div class="modal-equipment-visual is-icon">${icon(item.icon || "package", equipmentNameFor(item))}</div>`;
    const variants = item.selection?.type === "band"
      ? `<section class="modal-equipment-block"><div class="detail-section-heading"><h3>Bandas disponibles</h3>${renderNumberBadge(DATA.bands.length, { tone: "primary", label: `${DATA.bands.length} bandas` })}</div><div class="modal-band-list">${DATA.bands.map((band) => `<span><i style="--band-color:${band.swatch}" aria-hidden="true"></i><strong>${escapeHtml(band.color)}</strong><small>${band.pounds} libras · ${escapeHtml(band.kgf)} kgf · ${band.quantity} ${band.quantity === 1 ? "unidad" : "unidades"}</small></span>`).join("")}</div></section>`
      : item.variants?.length ? `<section class="modal-equipment-block"><div class="detail-section-heading"><h3>${escapeHtml(item.variantsLabel)}</h3></div><div class="weight-chip-list">${item.variants.map((variant) => renderBadge(`${variant}${item.unit ? ` ${item.unit}` : ""}`, { tone: "outline" })).join("")}</div></section>` : "";
    const backButton = returnToRoutine
      ? `<button class="back-button" type="button" data-action="back-to-routine">${icon("back")}<span>Volver a la rutina</span></button>`
      : `<button class="back-button" type="button" data-action="back-to-exercise" data-exercise="${movement.id}">${icon("back")}<span>Volver al ejercicio</span></button>`;
    dialog.innerHTML = `<div class="dialog-scroll detail-dialog-scroll" data-dialog-scroll>
      <header class="dialog-header equipment-modal-header">${backButton}<button type="button" class="icon-button dialog-close" data-action="close-dialog" aria-label="Cerrar">${icon("close")}</button></header>
      ${visual}
      <div class="dialog-body equipment-modal-body"><p class="eyebrow">${escapeHtml(clearProseText(item.label))}</p><h2 id="exercise-dialog-title">${escapeHtml(equipmentNameFor(item))}</h2>${item.parentName ? `<p class="equipment-parent">Parte de ${escapeHtml(equipmentNameFor({ name: item.parentName }))}</p>` : ""}<p class="equipment-modal-detail">${escapeHtml(clearEquipmentText(item.detail || ""))}</p><p>${escapeHtml(clearProseText(item.description || item.detail))}</p>
      ${variants}
      ${item.quantity ? `<dl class="equipment-fact"><dt>Unidades disponibles</dt><dd>${item.quantity}</dd></dl>` : ""}
      <div class="catalog-safety modal-equipment-safety">${icon("shield")}<span>${escapeHtml(clearProseText(item.note))}</span></div></div>
    </div>`;
    resetDialogScroll(dialog);
    dialog.querySelector(returnToRoutine ? '[data-action="back-to-routine"]' : '[data-action="back-to-exercise"]')?.focus({ preventScroll: true });
  }

  function showExerciseEquipment(exerciseId, ref) {
    showEquipmentDetail(ref, { exerciseId });
  }

  function showRoutineEquipment(ref) {
    if (!detailContext?.routineId) return;
    showEquipmentDetail(ref, { returnToRoutine: true });
  }

  function startWorkout(routineId, date = localDate()) {
    const item = routine(routineId);
    if (!item) return;
    if (workout && (workout.routineId !== routineId || workout.date !== date)) {
      pendingWorkoutStart = { routineId, date };
      const dialog = document.getElementById("confirm-dialog");
      dialog.innerHTML = `<div class="dialog-body"><span class="confirm-icon">${icon("alert")}</span><h2 id="confirm-dialog-title">¿Cambiar de entrenamiento?</h2><p>La sesión «${escapeHtml(routineTitleFor(routine(workout.routineId)))}» todavía no ha terminado. Si continúas, se descartarán sus series y tiempos guardados.</p></div><footer class="dialog-footer"><button class="button button-secondary" type="button" data-action="close-dialog">Conservar sesión</button><button class="button button-danger" type="button" data-action="confirm-replace-workout">Descartar y empezar</button></footer>`;
      openDialog(dialog);
      return;
    }
    if (!workout || workout.routineId !== routineId || workout.date !== date) {
      workout = WORKOUT_ENGINE.createWorkout({ routine: item, exercises: DATA.exercises, inventory: DATA, date, previousPerformance: previousPerformance() });
    }
    if (!workout.interval || ["warmup", "interval", "cooldown"].includes(workout.phase)) {
      workout.sessionTimer = WORKOUT_ENGINE.startTimer(workout.sessionTimer);
    }
    state.activeWorkout = workout;
    persistWorkout(true);
    document.querySelectorAll("dialog[open]").forEach((dialog) => closeDialog(dialog));
    renderWorkout();
    const screen = document.getElementById("workout-screen");
    const shell = document.querySelector(".app-shell");
    if (shell) shell.hidden = true;
    if (screen) screen.hidden = false;
    document.body.classList.add("workout-open");
    window.scrollTo({ top: 0, behavior: "auto" });
    window.setTimeout(() => screen?.querySelector("[data-action='close-workout']")?.focus({ preventScroll: true }), 0);
    startWorkoutTicker();
  }

  function workoutHeader(item) {
    const session = WORKOUT_ENGINE.timerSnapshot(workout.sessionTimer);
    return `<header class="workout-player-header"><a href="#${route}" class="workout-back" data-action="close-workout">${icon("back")}<span>Volver</span></a><div class="workout-player-title"><span class="eyebrow">Entrenamiento en curso</span><h1 id="workout-screen-title">${escapeHtml(routineTitleFor(item))}</h1><p>${formatDate(parseLocalDate(workout.date), { weekday: "long", day: "numeric", month: "long" })}</p></div><div class="workout-header-actions"><div class="workout-session-clock" role="timer" aria-label="Tiempo transcurrido de la sesión"><strong data-session-timer>${formatClock(session.elapsedSeconds)}</strong></div><button class="workout-session-reset" type="button" data-action="request-workout-reset" aria-label="Reiniciar esta sesión desde cero" title="Reiniciar esta sesión desde cero">${icon("reset")}<span>Reiniciar sesión</span></button></div></header>`;
  }

  function compactSetProgress(step) {
    const resolved = step.sets.every((set) => set.completed || set.skipped);
    const visibleProgress = Math.min(step.sets.length, step.currentSetIndex + (resolved ? 1 : 0));
    const percent = step.sets.length ? visibleProgress / step.sets.length * 100 : 0;
    const previousSet = step.currentSetIndex > 0 ? step.currentSetIndex - 1 : -1;
    return `<div class="compact-set-progress"><div><span>Progreso de series</span><strong>${visibleProgress} de ${step.sets.length}</strong>${previousSet >= 0 ? `<button type="button" class="compact-set-back" data-action="workout-go-set" data-set="${previousSet}" aria-label="Volver a la serie ${previousSet + 1}">${icon("back")}<span>Serie anterior</span></button>` : ""}</div><div class="compact-set-track" role="progressbar" aria-label="Posición en las series" aria-valuemin="0" aria-valuemax="${step.sets.length}" aria-valuenow="${visibleProgress}"><i style="width:${percent}%"></i></div></div>`;
  }

  function renderStrengthWorkout(item, progress) {
    const workComplete = WORKOUT_ENGINE.workoutComplete(workout);
    if (workComplete && !WORKOUT_ENGINE.effortComplete(workout)) {
      const unratedStep = workout.steps.findIndex((candidate) => candidate.sets.some((set) => set.completed) && !candidate.effort);
      if (unratedStep >= 0) workout.currentStepIndex = unratedStep;
    }
    workout.currentStepIndex = Math.max(0, Math.min(workout.currentStepIndex, workout.steps.length - 1));
    const step = workout.steps[workout.currentStepIndex];
    const movement = exercise(step.exerciseId);
    const technique = techniqueSafetyContent(movement);
    const techniqueSteps = renderTechniqueSteps(technique.steps);
    const safetyPoints = renderSafetyPoints(technique.safetyPoints);
    step.currentSetIndex = Math.max(0, Math.min(step.currentSetIndex, step.sets.length - 1));
    const currentSet = step.sets[step.currentSetIndex];
    const snapshot = WORKOUT_ENGINE.timerSnapshot(workout.timer);
    const timerValue = workout.timer.mode === "countdown" ? snapshot.remainingSeconds : snapshot.elapsedSeconds;
    const complete = workComplete && WORKOUT_ENGINE.effortComplete(workout) && workout.readyToFinish;
    const stepResolved = step.sets.every((set) => set.completed || set.skipped);
    const stepCompleted = step.sets.filter((set) => set.completed || set.skipped).length;
    const position = `<nav class="workout-position" aria-label="Navegación entre ejercicios"><div><span>Ejercicio ${workout.currentStepIndex + 1} de ${workout.steps.length}</span><strong>${stepCompleted} de ${step.sets.length} series registradas</strong></div><div><button type="button" class="button button-secondary" data-action="workout-go-step" data-step="${workout.currentStepIndex - 1}" ${workout.currentStepIndex === 0 ? "disabled" : ""}>${icon("back")}<span class="workout-position-label">Anterior</span></button><button type="button" class="button button-secondary" data-action="workout-go-step" data-step="${workout.currentStepIndex + 1}" ${workout.currentStepIndex === workout.steps.length - 1 ? "disabled" : ""}><span class="workout-position-label">Siguiente</span>${icon("arrow")}</button></div></nav>`;
    if (complete) {
      return `${workoutHeader(item)}<main class="workout-main"><section class="workout-finish-card"><span>${icon("check")}</span><p class="eyebrow">Rutina completada</p><h3>Todo el trabajo planificado está registrado</h3><p>Al guardar, las cargas, bandas, repeticiones, tiempos y notas quedarán disponibles como referencia para la próxima sesión.</p><button class="button button-accent button-wide" type="button" data-action="finish-workout">Guardar en mi diario</button></section></main>`;
    }
    const previousEffort = effortMeta(step.previous?.effort);
    const previous = step.previous ? `<div class="previous-load">${icon("trend")}<span><strong>Última vez</strong>${formatDate(parseLocalDate(step.previous.date), { day: "numeric", month: "short" })} · ${escapeHtml(selectionSummary(step.previous.selection))}${step.previous.bestReps ? ` · hasta ${step.previous.bestReps} repeticiones` : ""}${previousEffort ? `<em>${escapeHtml(previousEffort.advice)}</em>` : ""}</span></div>` : `<div class="previous-load is-empty">${icon("info")}<span><strong>Primer registro</strong>La configuración de hoy será tu referencia la próxima vez.</span></div>`;
    const sets = step.sets.map((set, index) => `<button type="button" class="set-row ${index === step.currentSetIndex ? "is-active" : ""} ${set.completed ? "is-complete" : ""} ${set.skipped ? "is-skipped" : ""}" data-action="workout-go-set" data-set="${index}"><span>${set.completed ? icon("check") : set.skipped ? "—" : set.number}</span><strong>Serie ${set.number}</strong><small>${set.completed ? `${set.reps ?? ""}${set.reps !== null ? " repeticiones" : ""}${set.durationSeconds ? `${set.reps !== null ? " · " : ""}${formatClock(set.durationSeconds)}` : ""}` : set.skipped ? "Omitida" : "Pendiente"}</small></button>`).join("");
    const timerLabel = workout.phase === "rest" ? "Descanso" : step.plan.targetType === "seconds" ? "Tiempo de trabajo" : "Cronómetro de la serie";
    const timerButton = workout.timer.running ? "Pausar" : snapshot.elapsedSeconds > 0 ? "Continuar" : "Iniciar";
    const completedExerciseActions = `<div class="completed-exercise-actions"><button class="button button-secondary" type="button" data-action="workout-repeat-exercise">${icon("reset")} Repetir ejercicio</button><button class="button button-primary" type="button" data-action="workout-next-exercise">${WORKOUT_ENGINE.workoutComplete(workout) && WORKOUT_ENGINE.effortComplete(workout) ? "Ver resumen" : "Siguiente ejercicio"} ${icon("arrow")}</button></div>`;
    const materialPreparation = renderMaterialPreparation(movement, item.logistics, step.selection);
    const repetitionValues = Array.from({ length: 51 }, (_, value) => value);
    if (currentSet.reps > 50) repetitionValues.push(currentSet.reps);
    const repetitionOptions = repetitionValues.map((value) => `<option value="${value}" ${currentSet.reps === value ? "selected" : ""}>${value}${value === step.plan.targetMin && value === step.plan.targetMax ? " · objetivo indicado" : value === step.plan.targetMin ? " · mínimo indicado" : value === step.plan.targetMax ? " · máximo indicado" : ""}</option>`).join("");
    const restDurationValues = Array.from({ length: 40 }, (_, index) => (index + 1) * 15);
    if (!restDurationValues.includes(step.restSeconds)) restDurationValues.push(step.restSeconds);
    restDurationValues.sort((first, second) => first - second);
    const restDurationControl = `<label class="rest-duration-control"><span class="sr-only">Descanso después de completar la serie</span><select data-workout-control="rest-seconds" aria-label="Segundos de descanso">${restDurationValues.map((seconds) => `<option value="${seconds}" ${step.restSeconds === seconds ? "selected" : ""}>${seconds} s</option>`).join("")}</select></label>`;
    const rest = workout.phase === "rest"
      ? `<section class="workout-panel rest-panel"><span class="rest-icon">${icon("clock")}</span><p class="eyebrow">Recuperación activa</p><h3>Respira y prepara la siguiente serie</h3>${compactSetProgress(step)}${renderWorkoutTimer(timerValue, { rest: true })}${materialPreparation}<div class="timer-actions"><button class="button button-secondary" type="button" data-action="workout-rest-adjust" data-seconds="-15"><span class="wide-control-label">Quitar 15 segundos</span><span class="compact-control-label">−15 s</span></button><button class="button button-primary" type="button" data-action="workout-timer-toggle">${icon(workout.timer.running ? "pause" : "play")} ${timerButton}</button><button class="button button-secondary" type="button" data-action="workout-rest-adjust" data-seconds="15"><span class="wide-control-label">Añadir 15 segundos</span><span class="compact-control-label">+15 s</span></button></div><button class="text-button" type="button" data-action="workout-skip-rest">Terminar descanso ahora</button></section>`
      : stepResolved
        ? `<section class="workout-panel effort-wait-panel">${icon("check")}<p class="eyebrow">Ejercicio terminado</p><h3>${step.effort ? "Ejercicio registrado" : "Valora el esfuerzo para continuar"}</h3><p>${step.effort ? "Puedes repetir este ejercicio o avanzar cuando estés preparado." : "Elige una de las tres opciones que aparecen justo debajo."}</p>${compactSetProgress(step)}${completedExerciseActions}</section>`
        : `<section class="workout-panel set-control"><div class="workout-panel-heading"><div><span class="eyebrow">Serie ${currentSet.number} de ${step.sets.length}</span><h3>${timerLabel}</h3></div>${renderBadge(clearSequenceText(step.prescription), { tone: "success", className: "set-target-badge" })}</div>${compactSetProgress(step)}${renderWorkoutTimer(timerValue)}${materialPreparation}<div class="timer-actions"><button class="button button-secondary" type="button" data-action="workout-timer-reset">${icon("reset")} Reiniciar</button><button class="button button-primary timer-main-button" type="button" data-action="workout-timer-toggle">${icon(workout.timer.running ? "pause" : "play")} ${timerButton}</button></div><div class="set-inputs">${renderSeriesSelectionFields(step.selection, movement)}${step.plan.targetType === "reps" ? `<label class="workout-field"><span>Repeticiones realizadas</span><select data-workout-control="reps">${repetitionOptions}</select></label>` : step.plan.targetType === "seconds" ? `<label class="workout-field"><span>Tiempo objetivo${step.plan.perSide ? " por lado" : ""}</span><input type="number" min="${step.plan.targetMin}" max="${step.plan.targetMax}" inputmode="numeric" data-workout-control="set-target-seconds" value="${currentSet.targetSeconds}" /><small>${step.plan.targetMin === step.plan.targetMax ? `${step.plan.targetMin} segundos documentados` : `Entre ${step.plan.targetMin} y ${step.plan.targetMax} segundos`}${step.plan.perSide ? ". Reinicia el temporizador para el segundo lado antes de completar." : ""}</small></label>` : `<p class="timed-set-note">Usa el cronómetro libre para registrar este bloque.</p>`}${step.plan.targetType === "reps" ? `<label class="workout-field"><span>Repeticiones posibles en reserva</span><select data-workout-control="reserve"><option value="" ${currentSet.repetitionsInReserve === null ? "selected" : ""}>Sin registrar</option>${Array.from({ length: 11 }, (_, index) => `<option value="${index}" ${currentSet.repetitionsInReserve === index ? "selected" : ""}>${index}${index === 0 ? " · esfuerzo máximo" : ""}</option>`).join("")}</select></label>` : ""}</div><div class="complete-set-actions"><button class="button button-accent button-wide" type="button" data-action="workout-complete-set">${icon("check")} Completar y descansar</button>${restDurationControl}</div>${step.optional ? `<button class="text-button" type="button" data-action="workout-skip-exercise">Omitir este ejercicio opcional</button>` : ""}</section>`;
    const seriesPanel = `<section class="workout-panel set-list-panel"><div class="workout-panel-heading"><div><span class="eyebrow">Seguimiento</span><h3>Series</h3></div><span>${progress.completed} de ${progress.total}</span></div><div class="set-list">${sets}</div><div class="set-list-actions">${step.plannedSets < step.plan.maximumSets ? `<button class="text-button" type="button" data-action="workout-add-set">Añadir serie documentada</button>` : ""}${step.plannedSets > step.plan.minimumSets ? `<button class="text-button" type="button" data-action="workout-remove-set">Quitar última serie</button>` : ""}</div></section>`;
    const techniqueDisclosure = renderDisclosure({ className: "workout-details mobile-exercise-details", summary: "Técnica y seguridad", content: `<section class="workout-reference-section"><h4>Técnica</h4>${techniqueSteps}</section><section class="workout-reference-section"><h4>Seguridad</h4>${safetyPoints}</section>` });
    return `${workoutHeader(item)}<main class="workout-main">${position}<div class="workout-timer-stage">${rest}</div><section class="workout-exercise"><header class="workout-exercise-heading"><p class="eyebrow">${escapeHtml(clearProseText(movement.category))}${step.optional ? " · Ejercicio opcional" : ""}</p><h3>${escapeHtml(exerciseTitleFor(movement))}</h3></header><div class="workout-exercise-visual">${exerciseMedia(movement, `Referencia de ${exerciseTitleFor(movement)}`)}</div><div class="workout-exercise-copy">${techniqueDisclosure}</div></section>${previous}${seriesPanel}${stepResolved && workout.phase !== "rest" && step.sets.some((set) => set.completed) ? renderEffortRating(step.effort, "step") : ""}<label class="workout-field workout-notes"><span>Notas para la próxima sesión</span><textarea rows="2" maxlength="500" data-workout-control="notes" placeholder="Por ejemplo: técnica, molestias o ajuste para la próxima semana">${escapeHtml(step.notes)}</textarea></label></main>`;
  }

  function renderIntervalWorkout(item, progress) {
    const interval = workout.interval;
    const segment = WORKOUT_ENGINE.intervalSegment(interval);
    const snapshot = WORKOUT_ENGINE.timerSnapshot(workout.timer);
    const preparing = workout.phase === "ready" && !interval.completed;
    const warmingUp = workout.phase === "warmup" && !interval.completed;
    const active = workout.phase === "interval" && !interval.completed;
    const coolingDown = workout.phase === "cooldown" && !interval.completed;
    const timerValue = preparing ? 0 : warmingUp || coolingDown || interval.automatic ? snapshot.remainingSeconds : snapshot.elapsedSeconds;
    const movementOrder = interval.movementOrder?.length ? interval.movementOrder : workout.movements.map((movement, index) => index);
    const isCircuit = Boolean(segment?.roundCount && segment?.workStepsPerRound > 1);
    const findUpcomingMovement = (startIndex, excludedIndex = -1) => {
      for (let index = Math.max(0, startIndex); index < interval.timeline.length; index += 1) {
        const candidate = interval.timeline[index];
        if (candidate.kind === "work" && Number.isInteger(candidate.movementIndex) && candidate.movementIndex !== excludedIndex) return candidate.movementIndex;
      }
      return -1;
    };
    let currentMovementIndex = -1;
    let nextMovementIndex = -1;
    if (!interval.completed && !coolingDown) {
      if (active && segment?.kind === "work" && Number.isInteger(segment.movementIndex)) {
        currentMovementIndex = segment.movementIndex;
        nextMovementIndex = findUpcomingMovement(interval.currentSegmentIndex + 1, currentMovementIndex);
      } else {
        currentMovementIndex = findUpcomingMovement(active ? interval.currentSegmentIndex + 1 : interval.currentSegmentIndex);
        nextMovementIndex = findUpcomingMovement(interval.timeline.findIndex((candidate, index) => index >= interval.currentSegmentIndex && candidate.kind === "work" && candidate.movementIndex === currentMovementIndex) + 1, currentMovementIndex);
      }
    }
    const currentMovement = currentMovementIndex >= 0 ? exercise(workout.movements[currentMovementIndex]?.exerciseId) : null;
    const currentMovementTitle = currentMovement ? exerciseTitleFor(currentMovement) : segment?.label || "Ejercicio actual";
    const phaseLabel = interval.completed
      ? "Rutina terminada"
      : preparing
        ? "Antes de empezar"
        : warmingUp
          ? "Calentamiento"
          : coolingDown
            ? "Enfriamiento"
            : segment?.kind === "work"
              ? interval.automatic ? "Ejercicio en curso" : "Trabajo por repeticiones o distancia"
              : segment?.kind === "transition" ? "Preparación de material" : "Recuperación";
    const phaseClass = interval.completed ? "completed" : preparing ? "ready" : warmingUp ? "warmup" : coolingDown ? "cooldown" : segment?.kind === "work" ? "work" : "recovery";
    const phaseTone = phaseClass === "warmup" || phaseClass === "ready" ? "warning" : phaseClass === "cooldown" ? "info" : phaseClass === "recovery" ? "danger" : "success";
    const completedIntervals = interval.completed || coolingDown ? interval.totalIntervals : progress.completed;
    const intervalPercent = interval.totalIntervals ? completedIntervals / interval.totalIntervals * 100 : 0;
    const phasePrescription = preparing
      ? `${formatDuration(interval.metrics.totalSeconds)} de sesión total`
      : warmingUp
        ? `${formatDuration(interval.warmupSeconds)} de calentamiento`
        : coolingDown
          ? `${formatDuration(interval.cooldownSeconds)} de enfriamiento`
          : interval.automatic ? formatDuration(segment?.durationSeconds) : "Finaliza manualmente al completar el objetivo";
    const heading = interval.completed
      ? "Rutina completada"
      : preparing
        ? "Prepara el calentamiento"
        : warmingUp
          ? "Calentamiento en curso"
          : coolingDown
            ? "Vuelta a la calma"
            : currentMovementTitle;
    const currentPhaseGuidance = preparing || warmingUp
      ? item.warmupCue
      : coolingDown
        ? item.cooldownCue
        : active
          ? segment?.guidance || interval.phaseGuidance?.[segment?.kind] || segment?.label
          : "";
    const phaseGuidance = currentPhaseGuidance
      ? `<div class="interval-phase-guidance" aria-live="polite"><span aria-hidden="true">${icon(active && interval.phase === "work" ? "flame" : "activity")}</span><strong>${escapeHtml(clearProseText(currentPhaseGuidance))}</strong></div>`
      : "";
    const circuitPosition = isCircuit && active ? `<div class="interval-circuit-position" aria-label="Posición en el circuito"><div><span>Ronda completa</span><strong>${segment.round} de ${segment.roundCount}</strong></div><div><span>Ejercicio de la ronda</span><strong>${segment.workStep} de ${segment.workStepsPerRound}</strong></div></div>` : "";
    const progressLabel = "Esfuerzos completados";
    const intervalProgress = `<div class="interval-progress"><div><span>${progressLabel}</span><strong>${completedIntervals} de ${interval.totalIntervals}</strong></div><div role="progressbar" aria-label="${progressLabel}" aria-valuemin="0" aria-valuemax="${interval.totalIntervals}" aria-valuenow="${completedIntervals}"><i style="width:${intervalPercent}%"></i></div></div>`;
    const timerCaption = interval.completed
      ? "Tiempo finalizado"
      : preparing
        ? "Tiempo de calentamiento"
        : warmingUp
          ? "Tiempo restante de calentamiento"
          : coolingDown
            ? "Tiempo restante de enfriamiento"
            : !interval.automatic
              ? "Tiempo empleado en este esfuerzo"
              : segment?.kind === "work" ? `Tiempo restante para ${currentMovementTitle}` : `Tiempo restante de ${segment?.kind === "transition" ? "preparación" : "recuperación"}`;
    const phaseTimerFinished = (warmingUp || coolingDown) && snapshot.finished;
    const timerToggleIcon = phaseTimerFinished ? "check" : workout.timer.running ? "pause" : "play";
    const timerToggleLabel = phaseTimerFinished ? "Finalizado" : workout.timer.running ? "Pausar" : "Continuar";
    const timerToggleDisabled = phaseTimerFinished ? " disabled" : "";
    const variants = item.protocol.variants;
    const selectedVariant = variants.find((variant) => variant.id === interval.variantId) || variants[0];
    const variantControl = preparing ? `<div class="protocol-variant-panel"><label><span>Duración de esta sesión</span><select data-workout-control="protocol-variant" aria-label="Duración de esta sesión">${variants.map((variant) => `<option value="${escapeHtml(variant.id)}" ${variant.id === interval.variantId ? "selected" : ""}>${escapeHtml(variant.label)} · ${formatDuration(variant.metrics.totalSeconds)}</option>`).join("")}</select></label><dl><div><dt>Bloque principal</dt><dd>${formatDuration(selectedVariant.metrics.mainSeconds)}</dd></div><div><dt>Trabajo efectivo</dt><dd>${formatDuration(selectedVariant.metrics.workSeconds)}</dd></div><div><dt>Pausas</dt><dd>${formatDuration(selectedVariant.metrics.recoverySeconds)}</dd></div></dl></div>` : "";
    const controls = interval.completed
      ? `<p class="interval-rating-guidance">${WORKOUT_ENGINE.effortComplete(workout) ? "Valoración completada. Termina la sesión al final de la lista." : "Valora el esfuerzo de cada ejercicio al final de su tarjeta."}</p>`
      : preparing
        ? `<button class="button button-accent timer-start-intervals" type="button" data-action="workout-start-warmup">${icon("play")} Empezar calentamiento</button>`
        : warmingUp
          ? `<div class="timer-actions interval-timer-actions"><button class="button button-secondary" type="button" data-action="workout-timer-reset">${icon("reset")}<span class="wide-control-label">Reiniciar calentamiento</span><span class="compact-control-label">Reiniciar</span></button><button class="button button-primary timer-main-button" type="button" data-action="workout-timer-toggle"${timerToggleDisabled}>${icon(timerToggleIcon)} ${timerToggleLabel}</button><button class="button button-accent" type="button" data-action="workout-start-intervals" aria-label="Empezar los ejercicios"><span>Empezar</span>${icon("arrow")}</button></div>`
          : coolingDown
            ? `<div class="timer-actions interval-timer-actions"><button class="button button-secondary" type="button" data-action="workout-timer-reset">${icon("reset")}<span class="wide-control-label">Reiniciar enfriamiento</span><span class="compact-control-label">Reiniciar</span></button><button class="button button-primary timer-main-button" type="button" data-action="workout-timer-toggle"${timerToggleDisabled}>${icon(timerToggleIcon)} ${timerToggleLabel}</button><button class="button button-accent" type="button" data-action="workout-finish-cooldown" aria-label="Terminar el enfriamiento"><span>Terminar</span>${icon("check")}</button></div>`
            : `<div class="timer-actions interval-timer-actions"><button class="button button-secondary" type="button" data-action="workout-interval-reset">${icon("reset")}<span class="wide-control-label">Reiniciar bloque</span><span class="compact-control-label">Reiniciar</span></button><button class="button button-primary timer-main-button" type="button" data-action="workout-timer-toggle">${icon(timerToggleIcon)} ${timerToggleLabel}</button><button class="button button-secondary" type="button" data-action="workout-next-interval"><span class="wide-control-label">${interval.automatic ? "Siguiente fase" : "Completar esfuerzo"}</span><span class="compact-control-label">${interval.automatic ? "Siguiente" : "Completar"}</span>${icon("arrow")}</button></div>`;
    const configuredMovementIndexes = [...new Set(movementOrder)].filter((index) => workout.movements[index]);
    workout.movements.forEach((movement, index) => { if (!configuredMovementIndexes.includes(index)) configuredMovementIndexes.push(index); });
    const currentCardPosition = configuredMovementIndexes.indexOf(currentMovementIndex);
    const rotatedMovementIndexes = currentCardPosition >= 0
      ? [...configuredMovementIndexes.slice(currentCardPosition), ...configuredMovementIndexes.slice(0, currentCardPosition)]
      : configuredMovementIndexes;
    const visibleMovementIndexes = active || preparing || warmingUp
      ? [...new Set([currentMovementIndex, nextMovementIndex, ...rotatedMovementIndexes])].filter((index) => index >= 0)
      : configuredMovementIndexes;
    const movements = visibleMovementIndexes.map((index) => {
      const movement = workout.movements[index];
      const movementData = exercise(movement.exerciseId);
      const previousEffort = effortMeta(movement.previous?.effort);
      const technique = techniqueSafetyContent(movementData);
      const isCurrent = !interval.completed && !coolingDown && currentMovementIndex === index;
      const isNext = !isCurrent && !interval.completed && !coolingDown && nextMovementIndex === index;
      const stateBadge = isCurrent ? renderBadge("Actual", { tone: "success", className: "interval-movement-state" }) : isNext ? renderBadge("Siguiente", { tone: "info", className: "interval-movement-state" }) : "";
      const movementDisclosure = renderDisclosure({ className: "workout-details interval-movement-details", summary: "Técnica y seguridad", content: `<section class="workout-reference-section"><h4>Técnica</h4>${renderTechniqueSteps(technique.steps)}</section><section class="workout-reference-section"><h4>Seguridad</h4>${renderSafetyPoints(technique.safetyPoints)}</section>` });
      return `<article class="interval-movement${isCurrent ? " is-current" : isNext ? " is-next" : ""}" data-movement-index="${index}"${isCurrent ? " aria-current=\"step\"" : ""}><header class="interval-movement-title"><div class="interval-movement-title-row"><span>Ejercicio ${index + 1}</span>${stateBadge}</div><h3>${escapeHtml(exerciseTitleFor(movementData))}</h3>${movement.previous ? `<small>Última vez: ${escapeHtml(selectionSummary(movement.previous.selection))}${previousEffort ? ` · ${escapeHtml(previousEffort.action)}` : ""}</small>` : ""}</header><div class="interval-movement-visual">${exerciseMedia(movementData, `Referencia de ${exerciseTitleFor(movementData)}`)}</div>${renderEquipmentControl(movement.selection, movementData, `movement-${index}`)}${movementDisclosure}${interval.completed ? renderEffortRating(movement.effort, `movement-${index}`, true) : ""}</article>`;
    }).join("");
    const movementHeading = interval.completed
      ? ["Valora tus ejercicios", "Indica el esfuerzo de cada uno para guardar la sesión."]
      : active
        ? ["Ejercicios de la ronda", "El ejercicio actual aparece primero; el siguiente y el resto del orden continúan visibles."]
        : coolingDown
          ? ["Ejercicios realizados", "Completa el enfriamiento antes de valorar la sesión."]
        : ["Ejercicios y material", "Deja todo preparado antes de iniciar el bloque."];
    const movementList = !workout.movements.length ? "" : `<section class="interval-movement-list ${interval.completed ? "is-rating" : active ? "is-active" : "is-preparation"}"><div class="section-heading"><div><h3>${movementHeading[0]}</h3><p>${movementHeading[1]}</p></div></div><div class="interval-movement-stack">${movements}</div></section>`;
    const sessionCompletion = interval.completed && WORKOUT_ENGINE.effortComplete(workout) ? `<section class="interval-session-completion"><button class="button button-accent button-wide" type="button" data-action="finish-workout">${icon("check")} Terminar sesión</button></section>` : "";
    return `${workoutHeader(item)}<main class="interval-workout-main is-${phaseClass}"><section class="interval-hero is-${phaseClass}"><div class="interval-primary"><div class="interval-status-row">${renderBadge(phaseLabel, { tone: phaseTone, className: "interval-phase-badge" })}${renderBadge(phasePrescription, { tone: "outline", className: "interval-prescription-badge" })}</div><h3>${escapeHtml(heading)}</h3>${circuitPosition}${intervalProgress}<p class="interval-timer-caption">${escapeHtml(timerCaption)}</p>${renderWorkoutTimer(interval.completed ? 0 : timerValue, { rest: segment?.kind !== "work" || coolingDown, completed: interval.completed })}${phaseGuidance}${variantControl}${controls}</div></section>${movementList}${sessionCompletion}</main>`;
  }

  function renderWorkout() {
    if (!workout) return;
    const item = routine(workout.routineId);
    if (!item) return;
    const progress = WORKOUT_ENGINE.workoutProgress(workout);
    const screen = document.getElementById("workout-screen");
    screen.innerHTML = `<div class="workout-player">${workout.interval ? renderIntervalWorkout(item, progress) : renderStrengthWorkout(item, progress)}</div>`;
    enhanceSelects(screen);
  }

  function stopWorkoutTicker() {
    if (workoutTicker) window.clearInterval(workoutTicker);
    workoutTicker = null;
  }

  const WORKOUT_ALARM_URL = "public/audio/timer-alarm.wav";
  let workoutAudioContext = null;
  let workoutAlarmBuffer = null;
  let workoutAlarmLoad = null;

  function loadWorkoutAlarm() {
    if (!workoutAudioContext || workoutAlarmBuffer) return Promise.resolve(workoutAlarmBuffer);
    if (workoutAlarmLoad) return workoutAlarmLoad;
    workoutAlarmLoad = fetch(WORKOUT_ALARM_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`No se pudo cargar la alarma (${response.status})`);
        return response.arrayBuffer();
      })
      .then((data) => workoutAudioContext.decodeAudioData(data))
      .then((buffer) => {
        workoutAlarmBuffer = buffer;
        return buffer;
      })
      .catch(() => null)
      .finally(() => {
        if (!workoutAlarmBuffer) workoutAlarmLoad = null;
      });
    return workoutAlarmLoad;
  }

  function primeWorkoutSignal() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      workoutAudioContext ||= new AudioContext();
      workoutAudioContext.resume?.();
      loadWorkoutAlarm();
    } catch (error) { /* La vibración y la señal visual siguen disponibles. */ }
  }

  function playWorkoutAlarm() {
    if (!workoutAudioContext || !workoutAlarmBuffer) return false;
    const startAt = workoutAudioContext.currentTime;
    [0, .68].forEach((delay) => {
      const source = workoutAudioContext.createBufferSource();
      source.buffer = workoutAlarmBuffer;
      source.connect(workoutAudioContext.destination);
      source.start(startAt + delay);
    });
    return true;
  }

  function signalWorkoutTimer() {
    navigator.vibrate?.([250, 120, 250]);
    try {
      workoutAudioContext?.resume?.();
      if (playWorkoutAlarm()) return;
      loadWorkoutAlarm()?.then(() => playWorkoutAlarm());
    } catch (error) { /* El aviso visual sigue siendo suficiente. */ }
  }

  function advanceInterval() {
    if (!workout?.interval || workout.interval.completed) return;
    const interval = workout.interval;
    if (interval.currentSegmentIndex < interval.timeline.length - 1) {
      interval.currentSegmentIndex += 1;
      WORKOUT_ENGINE.syncIntervalState(interval);
      const segment = WORKOUT_ENGINE.intervalSegment(interval);
      workout.timer = WORKOUT_ENGINE.startTimer(WORKOUT_ENGINE.createTimer(interval.automatic ? "countdown" : "countup", interval.automatic ? segment.durationSeconds : 0));
    } else {
      workout.phase = "cooldown";
      workout.timer = WORKOUT_ENGINE.startTimer(WORKOUT_ENGINE.createTimer("countdown", interval.cooldownSeconds));
    }
    announcedTimerFinish = "";
    persistWorkout(true);
    renderWorkout();
  }

  function handleWorkoutTimerFinished() {
    if (!workout) return;
    const finishKey = `${workout.phase}-${workout.interval?.currentSegmentIndex ?? workout.currentStepIndex}-${workout.interval?.phase || "set"}`;
    if (announcedTimerFinish === finishKey) return;
    announcedTimerFinish = finishKey;
    signalWorkoutTimer();
    if (workout.interval && workout.phase === "interval") advanceInterval();
    else if (workout.phase === "warmup") {
      workout.timer = WORKOUT_ENGINE.pauseTimer(workout.timer);
      persistWorkout(true);
      renderWorkout();
      toast("Calentamiento terminado. Empieza cuando estés preparado.");
    } else if (workout.phase === "cooldown") {
      workout.timer = WORKOUT_ENGINE.pauseTimer(workout.timer);
      persistWorkout(true);
      renderWorkout();
      toast("Enfriamiento terminado. Ya puedes cerrar la rutina.");
    }
    else if (workout.phase === "rest") {
      const needsEffort = currentStepResolved() && !workout.steps[workout.currentStepIndex].effort;
      finishStrengthRest();
      toast(needsEffort ? "Descanso terminado. Valora el esfuerzo para continuar." : "Descanso terminado. Siguiente serie preparada.");
    } else {
      workout.timer = WORKOUT_ENGINE.pauseTimer(workout.timer);
      persistWorkout(true);
      renderWorkout();
      toast("Tiempo de trabajo completado.");
    }
  }

  function startWorkoutTicker() {
    stopWorkoutTicker();
    workoutTicker = window.setInterval(() => {
      if (!workout || document.getElementById("workout-screen")?.hidden) return;
      const timer = WORKOUT_ENGINE.timerSnapshot(workout.timer);
      const value = workout.interval?.completed ? 0 : workout.timer.mode === "countdown" ? timer.remainingSeconds : timer.elapsedSeconds;
      document.querySelectorAll("[data-workout-timer]").forEach((node) => {
        const formattedValue = formatClock(value);
        node.textContent = formattedValue;
        const timer = node.closest(".workout-timer");
        if (timer?.dataset.timerStateLabel) timer.setAttribute("aria-label", `${timer.dataset.timerStateLabel}: ${formattedValue}`);
      });
      const session = WORKOUT_ENGINE.timerSnapshot(workout.sessionTimer);
      document.querySelectorAll("[data-session-timer]").forEach((node) => { node.textContent = formatClock(session.elapsedSeconds); });
      if (timer.finished && workout.timer.running) handleWorkoutTimerFinished();
      persistWorkout();
    }, 250);
  }

  function finishWorkout() {
    if (!workout || !WORKOUT_ENGINE.workoutComplete(workout)) { toast("Completa primero el trabajo planificado.", true); return; }
    if (!WORKOUT_ENGINE.effortComplete(workout)) { toast("Valora el esfuerzo de cada ejercicio antes de guardar.", true); return; }
    const item = routine(workout.routineId);
    const now = Date.now();
    workout.sessionTimer = WORKOUT_ENGINE.pauseTimer(workout.sessionTimer, now);
    const sessionDurationSeconds = Math.round(WORKOUT_ENGINE.timerSnapshot(workout.sessionTimer, now).elapsedSeconds);
    const plannedSeconds = workout.interval?.metrics.totalSeconds || item.estimatedMinutes * 60;
    const performance = workout.interval
      ? workout.movements.map((movement) => ({ exerciseId: movement.exerciseId, prescription: item.sequence, notes: "", effort: movement.effort, selection: movement.selection, sets: [] }))
      : workout.steps.map((step) => ({ exerciseId: step.exerciseId, prescription: step.prescription, notes: step.notes, effort: step.effort, selection: step.selection, sets: step.sets.filter((set) => set.completed || set.skipped) }));
    const exercisesCompleted = workout.interval ? workout.movements.length : performance.filter((entry) => entry.sets.some((set) => set.completed)).length;
    const record = {
      id: `${workout.date}-${workout.routineId}-${now}`,
      profileId: state.activeProfile,
      routineId: workout.routineId,
      date: workout.date,
      duration: Math.max(1, Math.round(sessionDurationSeconds / 60)),
      plannedMinutes: Math.max(1, Math.round(plannedSeconds / 60)),
      plannedSeconds,
      protocolVariantId: workout.interval?.variantId || null,
      sessionDurationSeconds,
      exercises: exercisesCompleted,
      performance,
      completedAt: new Date(now).toISOString()
    };
    state.completions.push(record);
    workout = null;
    state.activeWorkout = null;
    stopWorkoutTicker();
    saveState();
    const screen = document.getElementById("workout-screen");
    const shell = document.querySelector(".app-shell");
    if (screen) screen.hidden = true;
    if (shell) shell.hidden = false;
    document.body.classList.remove("workout-open");
    renderAll();
    navigate("progreso");
    celebrate();
    toast("Sesión guardada con tus cargas, tiempos y esfuerzo.");
  }

  function confirmReplaceWorkout() {
    const next = pendingWorkoutStart;
    if (!next) return;
    pendingWorkoutStart = null;
    workout = null;
    state.activeWorkout = null;
    saveState();
    closeDialog(document.getElementById("confirm-dialog"));
    startWorkout(next.routineId, next.date);
  }

  function requestWorkoutReset() {
    if (!workout) return;
    const item = routine(workout.routineId);
    if (!item) return;
    const dialog = document.getElementById("confirm-dialog");
    dialog.innerHTML = `<div class="dialog-body"><span class="confirm-icon">${icon("reset")}</span><h2 id="confirm-dialog-title">¿Reiniciar esta sesión?</h2><p>Se pondrán a cero el cronómetro, las series, los descansos, las cargas, las repeticiones, el esfuerzo y las notas de «${escapeHtml(routineTitleFor(item))}». Tu plan semanal y el historial de sesiones anteriores se conservarán.</p></div><footer class="dialog-footer"><button class="button button-secondary" type="button" data-action="close-dialog">Conservar sesión</button><button class="button button-danger" type="button" data-action="confirm-workout-reset">Reiniciar desde cero</button></footer>`;
    openDialog(dialog);
  }

  function confirmWorkoutReset() {
    if (!workout) return;
    const item = routine(workout.routineId);
    const date = workout.date;
    if (!item) return;
    workout = WORKOUT_ENGINE.createWorkout({ routine: item, exercises: DATA.exercises, inventory: DATA, date, previousPerformance: previousPerformance() });
    state.activeWorkout = workout;
    announcedTimerFinish = "";
    persistWorkout(true);
    closeDialog(document.getElementById("confirm-dialog"));
    renderWorkout();
    startWorkoutTicker();
    window.scrollTo({ top: 0, behavior: "auto" });
    toast("La sesión se ha reiniciado desde cero.");
  }

  function openProfile() {
    const dialog = document.getElementById("profile-dialog");
    dialog.innerHTML = `<header class="dialog-header"><div><p>Datos guardados en este dispositivo</p><h2 id="profile-dialog-title">Perfil y preferencias</h2></div><button type="button" class="icon-button dialog-close" data-action="close-dialog" aria-label="Cerrar">${icon("close")}</button></header><div class="dialog-body"><section class="settings-section settings-section-first"><h3>Copias y privacidad</h3><div class="settings-grid"><button class="settings-action" type="button" data-action="export-data">${icon("export")} Exportar copia</button><label class="settings-action" for="import-file">${icon("import")} Importar copia</label><input id="import-file" class="file-input" type="file" accept="application/json,.json" data-import-file /><button class="settings-action" type="button" data-action="print">${icon("calendar")} Imprimir plan</button><button class="settings-action danger" type="button" data-action="request-reset">${icon("trash")} Restablecer aplicación</button></div><p class="storage-copy">Entrenamiento usa un único perfil, no crea cuentas ni envía información a internet. El progreso se guarda en este navegador y puede descargarse como una copia de seguridad.</p></section></div>`;
    openDialog(dialog);
  }

  function exportData() {
    try {
      const payload = STATE_IO.createBackup(state, { appVersion: DATA.appVersion });
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = STATE_IO.backupFilename(localDate());
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast("Copia exportada correctamente.");
    } catch (error) {
      toast("No se pudo crear la copia de seguridad.", true);
    }
  }

  function importData(file) {
    if (!file) return;
    if (file.size > STATE_IO.MAX_BACKUP_BYTES) { toast("El archivo es demasiado grande.", true); return; }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = STATE_IO.parseBackupText(String(reader.result), {
          appVersion: DATA.appVersion,
          migrateState: (importedState) => PLANNER.migrateState(importedState, DATA.routines, DATA),
          profileExists: (profileId) => Boolean(DATA.profiles[profileId])
        });
        state = { ...defaultState(), ...imported, preferences: { ...defaultState().preferences, ...imported.preferences } };
        if (!state.schedules || typeof state.schedules !== "object") state.schedules = {};
        state.activeWorkout = WORKOUT_ENGINE.sanitizeWorkout(state.activeWorkout, DATA.routines, DATA.exercises, DATA);
        workout = state.activeWorkout;
        const stored = saveState();
        closeDialog(document.getElementById("profile-dialog"));
        renderAll();
        navigate(route, false);
        toast(stored ? "Copia importada correctamente." : "Copia cargada, pero el navegador no permitió guardarla.", !stored);
      } catch (error) { toast("No es una copia válida de Entrenamiento.", true); }
    };
    reader.onerror = () => toast("No se pudo leer el archivo.", true);
    reader.readAsText(file);
  }

  function requestWeeklyPreset(presetId) {
    const preset = weeklyPreset(presetId);
    if (!preset) return;
    pendingReset = false;
    pendingWeeklyPreset = preset.id;
    const dialog = document.getElementById("confirm-dialog");
    dialog.innerHTML = `<div class="dialog-body"><span class="confirm-icon confirm-icon-plan">${icon(preset.icon)}</span><h2 id="confirm-dialog-title">¿Usar «${escapeHtml(preset.title)}»?</h2><p>Reemplazará la planificación actual. Los días sin rutina quedarán como descansos editables y tu historial no se borrará.</p><ol class="confirm-preset-days">${preset.schedule.map((routineId, day) => `<li><span>${escapeHtml(DATA.days[day])}</span><strong>${routineId ? escapeHtml(routineTitleFor(routine(routineId))) : "Descanso"}</strong></li>`).join("")}</ol></div><footer class="dialog-footer"><button class="button button-secondary" type="button" data-action="close-dialog">Cancelar</button><button class="button button-primary" type="button" data-action="confirm-weekly-preset">Aplicar plan</button></footer>`;
    openDialog(dialog);
  }

  function confirmWeeklyPreset() {
    const preset = weeklyPreset(pendingWeeklyPreset);
    if (!preset) return;
    saveSchedule([...preset.schedule]);
    pendingWeeklyPreset = null;
    closeDialog(document.getElementById("confirm-dialog"));
    renderAll();
    navigate("plan", false);
    toast(`Plan «${preset.title}» aplicado.`);
  }

  function requestReset() {
    pendingWeeklyPreset = null;
    pendingReset = true;
    const dialog = document.getElementById("confirm-dialog");
    dialog.innerHTML = `<div class="dialog-body"><span class="confirm-icon">${icon("alert")}</span><h2 id="confirm-dialog-title">¿Restablecer todos los datos?</h2><p>Se eliminarán el historial, las preferencias y el progreso guardado en este dispositivo. Esta acción no se puede deshacer salvo que tengas una copia exportada.</p></div><footer class="dialog-footer"><button class="button button-secondary" type="button" data-action="close-dialog">Cancelar</button><button class="button button-danger" type="button" data-action="confirm-reset">Sí, restablecer</button></footer>`;
    openDialog(dialog);
  }

  function confirmReset() {
    if (!pendingReset) return;
    pendingReset = false;
    try {
      localStorage.removeItem(STORAGE_KEY);
      LEGACY_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
    } catch (error) { /* El estado en memoria igualmente se restablece. */ }
    state = defaultState();
    workout = null;
    libraryFilters = { query: "", muscle: null, specificMuscle: null, equipment: null, difficulty: null, panelOpen: false };
    routinePickerFilters = emptyRoutinePickerFilters();
    progressFilters = { query: "", range: "all", visible: 20 };
    stopWorkoutTicker();
    const screen = document.getElementById("workout-screen");
    const shell = document.querySelector(".app-shell");
    if (screen) screen.hidden = true;
    if (shell) shell.hidden = false;
    document.body.classList.remove("workout-open");
    document.querySelectorAll("dialog[open]").forEach((dialog) => closeDialog(dialog));
    renderAll();
    navigate("inicio");
    toast("La aplicación se ha restablecido.");
  }

  function printPlan() {
    const previousRoute = route;
    closeDialog(document.querySelector("dialog[open]"));
    renderPlan();
    navigate("plan", false);
    document.body.classList.add("printing-plan");
    try {
      window.print();
    } finally {
      document.body.classList.remove("printing-plan");
      if (previousRoute !== "plan") navigate(previousRoute, false);
    }
  }

  function toast(message, error = false) {
    const region = document.getElementById("toast-region");
    if (!region) return;
    region.querySelectorAll(".toast").forEach((existing) => existing.remove());
    const node = document.createElement("div");
    node.className = `toast ${error ? "is-error" : ""}`;
    node.innerHTML = `${icon(error ? "alert" : "check")}<span>${escapeHtml(message)}</span>`;
    region.appendChild(node);
    setTimeout(() => node.remove(), 3600);
  }

  function celebrate() {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const root = document.getElementById("confetti");
    const colors = ["#c9e265", "#da8b63", "#78aeb9", "#ffffff", "#2c684f"];
    root.innerHTML = Array.from({ length: 34 }, (_, index) => `<i style="left:${(index * 29) % 100}%;background:${colors[index % colors.length]};--drift:${(index % 2 ? 1 : -1) * (20 + index % 60)}px;animation-delay:${(index % 7) * .04}s"></i>`).join("");
    setTimeout(() => { root.innerHTML = ""; }, 1900);
  }

  function handleAction(target) {
    const action = target.dataset.action;
    if (!action) return;
    if (target.closest("#workout-screen") && action.startsWith("workout-")) primeWorkoutSignal();
    if (action === "open-profile") openProfile();
    if (action === "close-dialog") closeDialog(target.closest("dialog"));
    if (action === "close-workout") closeWorkout();
    if (action === "start-workout") startWorkout(target.dataset.routine, target.dataset.date || localDate());
    if (action === "preview-routine") previewRoutine(target.dataset.routine, target.dataset.date || localDate());
    if (action === "preview-picker-routine") {
      routinePickerPreviewDay = Number(target.dataset.day);
      previewRoutine(target.dataset.routine, target.dataset.date || localDate());
    }
    if (action === "back-to-routine-picker" && Number.isInteger(routinePickerPreviewDay)) openRoutinePicker(routinePickerPreviewDay);
    if (action === "view-exercise") showExercise(target.dataset.exercise);
    if (action === "view-routine-exercise") showExercise(target.dataset.exercise, false, true);
    if (action === "view-exercise-equipment") showExerciseEquipment(target.dataset.exercise, { kind: target.dataset.equipmentKind, id: target.dataset.equipmentId });
    if (action === "view-routine-equipment") showRoutineEquipment({ kind: target.dataset.equipmentKind, id: target.dataset.equipmentId });
    if (action === "back-to-exercise") showExercise(target.dataset.exercise, true, true);
    if (action === "back-to-routine" && detailContext?.routineId) previewRoutine(detailContext.routineId, detailContext.date, true);
    if (action === "choose-routine") openRoutinePicker(target.dataset.day);
    if (action === "clear-routine-search") {
      routinePickerFilters.query = "";
      openRoutinePicker(target.dataset.day);
      document.querySelector("[data-routine-search]")?.focus();
    }
    if (action === "toggle-routine-filters") {
      routinePickerFilters.panelOpen = !routinePickerFilters.panelOpen;
      openRoutinePicker(target.dataset.day);
      document.querySelector("[data-action='toggle-routine-filters']")?.focus();
    }
    if (action === "filter-routine") {
      const facet = target.dataset.facet;
      if (PLANNER.routineFacets.includes(facet)) {
        const canonicalValue = canonicalFacetValue(PLANNER.routineFilterFacets(routinePickerCatalog(), routinePickerFilters).facets[facet], target.dataset.value);
        if (canonicalValue !== null) {
          const nextValue = routinePickerFilters[facet] === canonicalValue ? null : canonicalValue;
          if (facet === "library") {
            const { query, panelOpen } = routinePickerFilters;
            routinePickerFilters = { ...emptyRoutinePickerFilters(Number(target.dataset.day)), query, panelOpen };
          }
          routinePickerFilters[facet] = nextValue;
        }
      }
      openRoutinePicker(target.dataset.day);
    }
    if (action === "reset-routine-filters") {
      const { query, panelOpen } = routinePickerFilters;
      routinePickerFilters = { ...emptyRoutinePickerFilters(Number(target.dataset.day)), query, panelOpen };
      openRoutinePicker(target.dataset.day);
    }
    if (action === "assign-routine" || action === "assign-rest") {
      const day = Number(target.dataset.day);
      const schedule = [...profileSchedule()];
      schedule[day] = action === "assign-rest" ? null : target.dataset.routine;
      saveSchedule(schedule);
      closeDialog(document.getElementById("exercise-dialog"));
      renderAll();
      navigate("plan", false);
      toast(action === "assign-rest" ? `${DATA.days[day]} marcado como descanso.` : `Rutina asignada al ${DATA.days[day].toLocaleLowerCase("es")}.`);
    }
    if (action === "rest-info") toast("Descansar también forma parte del plan.");
    if (action === "clear-search") { libraryFilters.query = ""; renderLibrary(); document.querySelector("[data-library-search]")?.focus(); }
    if (action === "clear-progress-search") {
      progressFilters.query = "";
      progressFilters.visible = 20;
      renderProgress();
      document.querySelector("[data-progress-search]")?.focus();
    }
    if (action === "reset-progress-filters") {
      progressFilters = { query: "", range: "all", visible: 20 };
      renderProgress();
      document.querySelector("[data-progress-search]")?.focus();
    }
    if (action === "load-more-progress") {
      progressFilters.visible += 20;
      renderProgress();
      document.querySelector("[data-action='load-more-progress']")?.focus();
    }
    if (action === "toggle-filters") { libraryFilters.panelOpen = !libraryFilters.panelOpen; renderLibrary(); document.querySelector("[data-action='toggle-filters']")?.focus(); }
    if (action === "toggle-exercise-filter") {
      const facet = target.dataset.facet;
      if (["muscle", "specificMuscle", "equipment", "difficulty"].includes(facet)) {
        const canonicalValue = canonicalFacetValue(PLANNER.exerciseFilterFacets(DATA.exercises, libraryFilters).facets[facet], target.dataset.value);
        if (canonicalValue !== null) libraryFilters[facet] = libraryFilters[facet] === canonicalValue ? null : canonicalValue;
      }
      renderLibrary();
    }
    if (action === "reset-filters") { libraryFilters = { query: "", muscle: null, specificMuscle: null, equipment: null, difficulty: null, panelOpen: libraryFilters.panelOpen }; renderLibrary(); }
    if (action === "workout-set-effort" && workout) {
      const context = target.dataset.context || "step";
      const movementIndex = context.startsWith("movement-") ? Number(context.split("-")[1]) : -1;
      const holder = movementIndex >= 0 ? workout.movements[movementIndex] : workout.steps[workout.currentStepIndex];
      const effort = WORKOUT_ENGINE.normalizeEffort(target.dataset.effort);
      if (holder && effort) {
        holder.effort = effort;
        if (!workout.interval) workout.readyToFinish = false;
        persistWorkout(true);
        renderWorkout();
        document.querySelector(`[data-action="workout-set-effort"][data-context="${context}"][data-effort="${effort}"]`)?.focus({ preventScroll: true });
      }
    }
    if (action === "workout-go-step" && workout && !workout.interval) {
      workout.timer = WORKOUT_ENGINE.pauseTimer(workout.timer);
      workout.currentStepIndex = Math.max(0, Math.min(Number(target.dataset.step), workout.steps.length - 1));
      const step = workout.steps[workout.currentStepIndex];
      const pending = step.sets.findIndex((set) => !set.completed && !set.skipped);
      step.currentSetIndex = pending >= 0 ? pending : step.sets.length - 1;
      setTimerForCurrentSet();
      persistWorkout(true);
      renderWorkout();
    }
    if (action === "workout-go-set" && workout && !workout.interval) {
      workout.timer = WORKOUT_ENGINE.pauseTimer(workout.timer);
      const step = workout.steps[workout.currentStepIndex];
      step.currentSetIndex = Math.max(0, Math.min(Number(target.dataset.set), step.sets.length - 1));
      const selectedSet = step.sets[step.currentSetIndex];
      if (selectedSet.selection) step.selection = structuredClone(selectedSet.selection);
      setTimerForCurrentSet();
      persistWorkout(true);
      renderWorkout();
    }
    if (action === "workout-repeat-exercise" && workout && !workout.interval) {
      const step = workout.steps[workout.currentStepIndex];
      step.sets = step.sets.map((set, index) => ({
        ...set,
        number: index + 1,
        reps: step.plan.targetType === "reps" ? step.plan.targetMin : null,
        targetSeconds: step.plan.targetType === "seconds" ? step.plan.targetMin : null,
        durationSeconds: 0,
        repetitionsInReserve: null,
        completed: false,
        skipped: false,
        selection: null,
        completedAt: null
      }));
      step.currentSetIndex = 0;
      step.effort = null;
      workout.readyToFinish = false;
      setTimerForCurrentSet();
      persistWorkout(true);
      renderWorkout();
      toast("Ejercicio preparado para repetirlo.");
    }
    if (action === "workout-next-exercise" && workout && !workout.interval) {
      const step = workout.steps[workout.currentStepIndex];
      if (!step.effort) {
        toast("Valora primero cómo te ha resultado el ejercicio.", true);
      } else {
        workout.readyToFinish = false;
        if (!prepareNextStrengthStep()) workout.readyToFinish = WORKOUT_ENGINE.workoutComplete(workout) && WORKOUT_ENGINE.effortComplete(workout);
        persistWorkout(true);
        renderWorkout();
      }
    }
    if (action === "workout-add-set" && workout && !workout.interval) {
      const step = workout.steps[workout.currentStepIndex];
      if (step.plannedSets < step.plan.maximumSets) {
        step.plannedSets += 1;
        step.sets.push({ number: step.plannedSets, reps: step.plan.targetType === "reps" ? step.plan.targetMin : null, targetSeconds: step.plan.targetType === "seconds" ? step.plan.targetMin : null, durationSeconds: 0, repetitionsInReserve: null, completed: false, skipped: false, selection: null, completedAt: null });
        step.currentSetIndex = step.sets.length - 1;
        setTimerForCurrentSet();
        persistWorkout(true);
        renderWorkout();
      }
    }
    if (action === "workout-remove-set" && workout && !workout.interval) {
      const step = workout.steps[workout.currentStepIndex];
      if (step.plannedSets > step.plan.minimumSets && !step.sets.at(-1).completed) {
        step.sets.pop();
        step.plannedSets -= 1;
        step.currentSetIndex = Math.min(step.currentSetIndex, step.sets.length - 1);
        setTimerForCurrentSet();
        persistWorkout(true);
        renderWorkout();
      } else toast("No se puede quitar una serie ya completada.", true);
    }
    if (action === "workout-timer-toggle" && workout) {
      if (!workout.interval && workout.phase === "ready") workout.phase = "set";
      workout.timer = workout.timer.running ? WORKOUT_ENGINE.pauseTimer(workout.timer) : WORKOUT_ENGINE.startTimer(workout.timer);
      announcedTimerFinish = "";
      persistWorkout(true);
      renderWorkout();
    }
    if (action === "workout-timer-reset" && workout) {
      if (workout.interval && ["warmup", "cooldown"].includes(workout.phase)) {
        const wasRunning = workout.timer.running;
        workout.timer = WORKOUT_ENGINE.resetTimer(workout.timer);
        if (wasRunning) workout.timer = WORKOUT_ENGINE.startTimer(workout.timer);
      } else if (!workout.interval) {
        setTimerForCurrentSet();
      }
      persistWorkout(true);
      renderWorkout();
    }
    if (action === "workout-complete-set" && workout && !workout.interval) {
      const step = workout.steps[workout.currentStepIndex];
      const set = step.sets[step.currentSetIndex];
      const elapsed = WORKOUT_ENGINE.timerSnapshot(workout.timer).elapsedSeconds;
      workout.timer = WORKOUT_ENGINE.pauseTimer(workout.timer);
      set.durationSeconds = Math.round(elapsed);
      set.completed = true;
      set.skipped = false;
      workout.readyToFinish = false;
      set.selection = structuredClone(step.selection);
      set.completedAt = Date.now();
      const sameStepPending = step.sets.findIndex((entry) => !entry.completed && !entry.skipped);
      if (sameStepPending >= 0) step.currentSetIndex = sameStepPending;
      if (WORKOUT_ENGINE.workoutComplete(workout)) {
        workout.phase = "ready";
        workout.timer = WORKOUT_ENGINE.resetTimer(workout.timer);
      } else {
        workout.phase = "rest";
        workout.timer = WORKOUT_ENGINE.startTimer(WORKOUT_ENGINE.createTimer("countdown", step.restSeconds));
      }
      announcedTimerFinish = "";
      persistWorkout(true);
      renderWorkout();
    }
    if (action === "workout-skip-exercise" && workout && !workout.interval) {
      const step = workout.steps[workout.currentStepIndex];
      step.sets.forEach((set) => { if (!set.completed) set.skipped = true; });
      const nextStep = workout.steps.findIndex((entry, index) => index > workout.currentStepIndex && entry.sets.some((set) => !set.completed && !set.skipped));
      if (nextStep >= 0) workout.currentStepIndex = nextStep;
      setTimerForCurrentSet();
      persistWorkout(true);
      renderWorkout();
    }
    if (action === "workout-rest-adjust" && workout && workout.phase === "rest") {
      const remaining = WORKOUT_ENGINE.timerSnapshot(workout.timer).remainingSeconds;
      const duration = Math.max(0, Math.min(600, Math.round(remaining + Number(target.dataset.seconds))));
      if (!duration) {
        finishStrengthRest();
        if (currentStepResolved() && !workout.steps[workout.currentStepIndex].effort) toast("Indica cómo te ha resultado el ejercicio para continuar.");
        return;
      }
      workout.timer = WORKOUT_ENGINE.startTimer(WORKOUT_ENGINE.createTimer("countdown", duration));
      announcedTimerFinish = "";
      persistWorkout(true);
      renderWorkout();
    }
    if (action === "workout-skip-rest" && workout && workout.phase === "rest") {
      finishStrengthRest();
      if (currentStepResolved() && !workout.steps[workout.currentStepIndex].effort) toast("Indica cómo te ha resultado el ejercicio para continuar.");
    }
    if (action === "workout-start-warmup" && workout?.interval && workout.phase === "ready") {
      workout.phase = "warmup";
      workout.timer = WORKOUT_ENGINE.startTimer(WORKOUT_ENGINE.createTimer("countdown", workout.interval.warmupSeconds));
      workout.sessionTimer = WORKOUT_ENGINE.startTimer(workout.sessionTimer);
      announcedTimerFinish = "";
      persistWorkout(true);
      renderWorkout();
    }
    if (action === "workout-start-intervals" && workout?.interval && workout.phase === "warmup") {
      workout.phase = "interval";
      WORKOUT_ENGINE.syncIntervalState(workout.interval);
      const segment = WORKOUT_ENGINE.intervalSegment(workout.interval);
      workout.timer = WORKOUT_ENGINE.startTimer(WORKOUT_ENGINE.createTimer(workout.interval.automatic ? "countdown" : "countup", workout.interval.automatic ? segment.durationSeconds : 0));
      workout.sessionTimer = WORKOUT_ENGINE.startTimer(workout.sessionTimer);
      announcedTimerFinish = "";
      persistWorkout(true);
      renderWorkout();
    }
    if (action === "workout-next-interval" && workout?.interval) advanceInterval();
    if (action === "workout-finish-cooldown" && workout?.interval && workout.phase === "cooldown") {
      const now = Date.now();
      workout.timer = WORKOUT_ENGINE.pauseTimer(workout.timer, now);
      workout.sessionTimer = WORKOUT_ENGINE.pauseTimer(workout.sessionTimer, now);
      workout.interval.completed = true;
      workout.phase = "complete";
      announcedTimerFinish = "";
      persistWorkout(true);
      renderWorkout();
    }
    if (action === "workout-interval-reset" && workout?.interval) {
      WORKOUT_ENGINE.configureProtocol(workout, routine(workout.routineId), workout.interval.variantId);
      announcedTimerFinish = "";
      persistWorkout(true);
      renderWorkout();
    }
    if (action === "finish-workout") finishWorkout();
    if (action === "confirm-replace-workout") confirmReplaceWorkout();
    if (action === "request-workout-reset") requestWorkoutReset();
    if (action === "confirm-workout-reset") confirmWorkoutReset();
    if (action === "request-weekly-preset") requestWeeklyPreset(target.dataset.preset);
    if (action === "confirm-weekly-preset") confirmWeeklyPreset();
    if (action === "export-data") exportData();
    if (action === "print") printPlan();
    if (action === "request-reset") requestReset();
    if (action === "confirm-reset") confirmReset();
  }

  function updateWorkoutControl(target) {
    if (!workout || !target.matches("[data-workout-control]")) return false;
    const control = target.dataset.workoutControl;
    if (control === "protocol-variant" && workout.interval && workout.phase === "ready") {
      WORKOUT_ENGINE.configureProtocol(workout, routine(workout.routineId), target.value);
      persistWorkout(true);
      renderWorkout();
      return true;
    }
    const context = target.dataset.context || "step";
    const isMovement = context.startsWith("movement-");
    const movementIndex = isMovement ? Number(context.split("-")[1]) : -1;
    const holder = isMovement ? workout.movements[movementIndex] : workout.steps[workout.currentStepIndex];
    const movement = holder ? exercise(holder.exerciseId) : null;
    let shouldRender = false;
    if (holder && ["modality", "load", "band", "band-count", "damper"].includes(control)) {
      const proposal = { ...holder.selection };
      if (control === "modality") proposal.modality = target.value;
      if (control === "load") proposal.loadKg = Number(target.value);
      if (control === "band") proposal.bandId = target.value;
      if (control === "band-count") proposal.bandCount = Number(target.value);
      if (control === "damper") proposal.damper = Number(target.value);
      holder.selection = WORKOUT_ENGINE.normalizeSelection(proposal, movement, DATA);
      shouldRender = control === "modality" || control === "band";
    }
    if (!isMovement && holder) {
      const set = holder.sets[holder.currentSetIndex];
      if (control === "reps") set.reps = Math.max(0, Math.min(999, Math.round(Number(target.value) || 0)));
      if (control === "reserve") set.repetitionsInReserve = target.value === "" ? null : Math.max(0, Math.min(10, Math.round(Number(target.value) || 0)));
      if (control === "set-target-seconds") {
        set.targetSeconds = Math.max(holder.plan.targetMin, Math.min(holder.plan.targetMax, Math.round(Number(target.value) || holder.plan.targetMin)));
        workout.timer = WORKOUT_ENGINE.createTimer("countdown", set.targetSeconds);
        workout.phase = "ready";
      }
      if (control === "rest-seconds") holder.restSeconds = Math.max(15, Math.min(600, Math.round(Number(target.value) || 15)));
      if (control === "notes") holder.notes = String(target.value).slice(0, 500);
    }
    persistWorkout(true);
    if (shouldRender) renderWorkout();
    return true;
  }

  document.addEventListener("click", (event) => {
    const disclosureSummary = event.target.closest(".app-disclosure > summary");
    if (disclosureSummary) { event.preventDefault(); toggleDisclosure(disclosureSummary.parentElement); return; }
    const routeLink = event.target.closest("[data-route]");
    if (routeLink) { event.preventDefault(); navigate(routeLink.dataset.route); return; }
    const actionTarget = event.target.closest("[data-action]");
    if (actionTarget) { event.preventDefault(); handleAction(actionTarget); }
  });

  document.addEventListener("input", (event) => {
    if (updateWorkoutControl(event.target)) return;
    if (event.target.matches("[data-routine-search]")) {
      routinePickerFilters.query = event.target.value;
      openRoutinePicker(event.target.dataset.day);
      const input = document.querySelector("[data-routine-search]");
      input?.focus();
      if (input) input.setSelectionRange(input.value.length, input.value.length);
    }
    if (event.target.matches("[data-library-search]")) {
      libraryFilters.query = event.target.value;
      renderLibrary();
      const input = document.querySelector("[data-library-search]");
      input?.focus();
      if (input) input.setSelectionRange(input.value.length, input.value.length);
    }
    if (event.target.matches("[data-progress-search]")) {
      progressFilters.query = event.target.value;
      progressFilters.visible = 20;
      renderProgress();
      const input = document.querySelector("[data-progress-search]");
      input?.focus();
      if (input) input.setSelectionRange(input.value.length, input.value.length);
    }
  });

  document.addEventListener("change", (event) => {
    if (updateWorkoutControl(event.target)) return;
    if (event.target.matches("[data-import-file]")) importData(event.target.files?.[0]);
    if (event.target.matches("[data-progress-range]")) {
      progressFilters.range = ["all", "eight-weeks", "year"].includes(event.target.value) ? event.target.value : "all";
      progressFilters.visible = 20;
      renderProgress();
    }
  });

  const scrollbarTimers = new WeakMap();
  function revealDialogScrollbar(scroller, linger = 650) {
    if (!scroller?.matches?.("[data-dialog-scroll]")) return;
    scroller.classList.add("is-scrolling");
    clearTimeout(scrollbarTimers.get(scroller));
    scrollbarTimers.set(scroller, setTimeout(() => scroller.classList.remove("is-scrolling"), linger));
  }

  document.addEventListener("scroll", (event) => revealDialogScrollbar(event.target), true);
  document.addEventListener("wheel", (event) => revealDialogScrollbar(event.target.closest?.("[data-dialog-scroll]")), { passive: true });
  document.addEventListener("touchmove", (event) => revealDialogScrollbar(event.target.closest?.("[data-dialog-scroll]")), { passive: true });
  document.addEventListener("pointerdown", (event) => revealDialogScrollbar(event.target.closest?.("[data-dialog-scroll]"), 900));
  document.addEventListener("pointerdown", (event) => {
    document.querySelectorAll(".custom-select.is-open").forEach((root) => {
      if (!root.contains(event.target)) closeCustomSelect(root);
    });
  });

  document.querySelectorAll("dialog").forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
        closeDialog(dialog);
      }
    });
    dialog.addEventListener("close", () => {
      if (!document.querySelector("dialog[open]")) document.body.classList.remove("dialog-open");
    });
  });

  window.addEventListener("hashchange", () => navigate(location.hash.slice(1), false));
  window.addEventListener("beforeunload", () => pauseWorkoutTimers());
  window.addEventListener("resize", () => document.querySelectorAll(".custom-select.is-open").forEach((root) => closeCustomSelect(root)));

  const customSelectObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => mutation.addedNodes.forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE) enhanceSelects(node);
    }));
  });
  customSelectObserver.observe(document.body, { childList: true, subtree: true });

  renderAll();
  navigate(location.hash.slice(1) || "inicio", false);
  if (storageRecovered) setTimeout(() => toast("Los datos locales no eran válidos; se inició una copia limpia.", true), 250);
})();
