(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TrainingSessionModel = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const DEFAULT_PHASE_GUIDANCE = {
    work: "Trabaja fuerte con una técnica controlada.",
    recovery: "Recupera y prepara el siguiente esfuerzo.",
    transition: "Cambia de posición o material con calma y seguridad."
  };
  const ROWER_PHASE_GUIDANCE = {
    work: "Rema a una intensidad fuerte pero sostenible.",
    recovery: "Rema con intensidad fácil.",
    transition: "Cambia de estación con calma y seguridad."
  };

  const timed = (kind, durationSeconds, options = {}) => ({
    kind,
    durationSeconds,
    estimatedSeconds: durationSeconds,
    activeSeconds: kind === "work" ? durationSeconds : 0,
    ...options
  });
  const manual = (estimatedSeconds, options = {}) => ({
    kind: "work",
    durationSeconds: null,
    estimatedSeconds,
    activeSeconds: estimatedSeconds,
    ...options
  });
  const work = (durationSeconds, exerciseSourceId, label, options = {}) => timed("work", durationSeconds, { exerciseSourceId, label, ...options });
  const recover = (durationSeconds, label = "Recuperación") => timed("recovery", durationSeconds, { label });
  const transition = (durationSeconds, label = "Cambio de estación") => timed("transition", durationSeconds, { label });

  function repeatedRounds(count, steps, betweenRoundsSeconds = 0, betweenRoundsLabel = "Recuperación entre rondas", includeFinalRecovery = false) {
    const output = [];
    const workSteps = steps.filter((step) => step.kind === "work").length;
    for (let round = 1; round <= count; round += 1) {
      let workStep = 0;
      for (const step of steps) {
        if (step.kind === "work") workStep += 1;
        output.push({ ...step, round, roundCount: count, workStep, workStepsPerRound: workSteps });
      }
      if ((round < count || includeFinalRecovery) && betweenRoundsSeconds) output.push({ ...recover(betweenRoundsSeconds, betweenRoundsLabel), round, roundCount: count });
    }
    return output;
  }

  function repeatedIntervals(count, workStep, recoverySeconds, recoveryLabel = "Recuperación", includeFinalRecovery = true) {
    const output = [];
    for (let round = 1; round <= count; round += 1) {
      output.push({ ...workStep, round, roundCount: count, workStep: 1, workStepsPerRound: 1 });
      if (includeFinalRecovery || round < count) output.push({ ...recover(recoverySeconds, recoveryLabel), round, roundCount: count });
    }
    return output;
  }

  function variableRounds(count, stepsForRound, betweenRoundsSeconds = 0, betweenRoundsLabel = "Recuperación después del esfuerzo", includeFinalRecovery = true) {
    const output = [];
    for (let round = 1; round <= count; round += 1) {
      const steps = stepsForRound(round);
      const workSteps = steps.filter((step) => step.kind === "work").length;
      let workStep = 0;
      for (const step of steps) {
        if (step.kind === "work") workStep += 1;
        output.push({ ...step, round, roundCount: count, workStep, workStepsPerRound: workSteps });
      }
      if ((round < count || includeFinalRecovery) && betweenRoundsSeconds) output.push({ ...recover(betweenRoundsSeconds, betweenRoundsLabel), round, roundCount: count });
    }
    return output;
  }

  function windowedIntervals(count, durationSeconds, exerciseSourceId, label, activeSeconds) {
    const action = `${label.charAt(0).toLocaleLowerCase("es")}${label.slice(1)}`;
    return Array.from({ length: count }, (_, index) => ({
      ...work(durationSeconds, exerciseSourceId, label, { activeSeconds, guidance: `Realiza ${action} y descansa el tiempo restante.` }),
      round: index + 1,
      roundCount: count,
      workStep: 1,
      workStepsPerRound: 1
    }));
  }

  const option = (id, label, warmupSeconds, cooldownSeconds, segments) => ({ id, label, warmupSeconds, cooldownSeconds, segments });
  const protocol = (exerciseSourceIds, variants, options = {}) => ({
    exerciseSourceIds,
    variants,
    defaultVariantId: variants.find((variant) => variant.id === "standard")?.id || variants[0].id,
    warmupCue: options.warmupCue || "Muévete suave y aumenta la intensidad.",
    cooldownCue: options.cooldownCue || "Muévete suave hasta normalizar la respiración.",
    phaseGuidance: options.phaseGuidance || DEFAULT_PHASE_GUIDANCE
  });
  const rowerProtocol = (exerciseSourceIds, variants, options = {}) => protocol(exerciseSourceIds, variants, {
    warmupCue: "Rema suave y aumenta la intensidad.",
    cooldownCue: "Rema muy suave hasta normalizar la respiración.",
    phaseGuidance: ROWER_PHASE_GUIDANCE,
    ...options
  });

  const circuit = (count, specs, betweenRoundsSeconds = 0, includeFinalRecovery = false) => repeatedRounds(count, specs.flatMap((spec, index) => [
    work(spec[0], spec[1], spec[2], spec[3] || {}),
    ...(index < specs.length - 1 && spec[4] ? [recover(spec[4], "Pausa antes del siguiente ejercicio")] : [])
  ]), betweenRoundsSeconds, "Recuperación entre rondas", includeFinalRecovery);

  const definitions = {
    R38: rowerProtocol(["E85"], [
      option("short", "Iniciación", 5 * 60, 3 * 60, [work(20 * 60, "E85", "Remo continuo sostenible", { activeSeconds: 20 * 60 })]),
      option("standard", "Estándar", 8 * 60, 4 * 60, [work(40 * 60, "E85", "Remo continuo sostenible", { activeSeconds: 40 * 60 })]),
      option("long", "Avanzada", 10 * 60, 5 * 60, [work(60 * 60, "E85", "Remo continuo sostenible", { activeSeconds: 60 * 60 })])
    ], { phaseGuidance: { ...ROWER_PHASE_GUIDANCE, work: "Mantén un ritmo uniforme y sostenible." } }),
    R39: rowerProtocol(["E86"], [3, 4, 5].map((warmup, index) => {
      const finish = [5, 8, 10][index];
      const segments = [];
      ["Brazos", "Tronco", "Piernas"].forEach((focus, drillIndex) => {
        segments.push(work(120, "E86", `Técnica centrada en ${focus.toLocaleLowerCase("es")}`, { activeSeconds: 120 }));
        if (drillIndex < 2) segments.push(recover(60, "Palada completa integrada"));
      });
      return option(["short", "standard", "long"][index], ["Corta", "Estándar", "Larga"][index], warmup * 60, finish * 60, segments);
    }), { cooldownCue: "Finaliza con paladas completas y controladas.", phaseGuidance: { ...ROWER_PHASE_GUIDANCE, work: "Prioriza la secuencia técnica, no la intensidad." } }),
    R40: rowerProtocol(["E87"], [
      option("short", "Corta", 8 * 60, 5 * 60, repeatedRounds(3, [work(6 * 60, "E87", "Remo a intensidad sostenida")], 2 * 60, "Remo suave entre bloques")),
      option("standard", "Estándar", 8 * 60, 5 * 60, repeatedRounds(3, [work(8 * 60, "E87", "Remo a intensidad sostenida")], 150, "Remo suave entre bloques")),
      option("long", "Larga", 8 * 60, 5 * 60, repeatedRounds(3, [work(10 * 60, "E87", "Remo a intensidad sostenida")], 3 * 60, "Remo suave entre bloques"))
    ], { phaseGuidance: { ...ROWER_PHASE_GUIDANCE, work: "Rema a un ritmo exigente que puedas sostener durante todo el bloque." } }),
    R41: rowerProtocol(["E88"], [
      option("short", "Corta", 8 * 60, 5 * 60, repeatedIntervals(6, work(60, "E88", "Remo fuerte"), 60, "Remo fácil", true)),
      option("standard", "Estándar", 9 * 60, 5 * 60, repeatedIntervals(9, work(60, "E88", "Remo fuerte"), 60, "Remo fácil", true)),
      option("long", "Larga", 10 * 60, 5 * 60, repeatedIntervals(12, work(60, "E88", "Remo fuerte"), 60, "Remo fácil", true))
    ]),
    R42: rowerProtocol(["E89"], [
      option("short", "Corta", 10 * 60, 5 * 60, repeatedIntervals(6, work(10, "E89", "Aceleración muy rápida"), 60, "Remo muy suave")),
      option("standard", "Estándar", 10 * 60, 6 * 60, repeatedIntervals(8, work(20, "E89", "Aceleración muy rápida"), 90, "Remo muy suave")),
      option("long", "Larga", 10 * 60, 8 * 60, repeatedIntervals(10, work(30, "E89", "Aceleración muy rápida"), 120, "Remo muy suave"))
    ], { phaseGuidance: { ...ROWER_PHASE_GUIDANCE, work: "Acelera con máxima calidad técnica; detente si la mecánica se degrada." } }),
    R43: rowerProtocol(["E90"], [
      option("short", "Corta", 8 * 60, 5 * 60, repeatedIntervals(6, manual(25, { exerciseSourceId: "E90", label: "Diez paladas potentes" }), 60, "Remo fácil")),
      option("standard", "Estándar", 8 * 60, 5 * 60, repeatedIntervals(8, manual(30, { exerciseSourceId: "E90", label: "Diez paladas potentes" }), 75, "Remo fácil")),
      option("long", "Larga", 8 * 60, 5 * 60, repeatedIntervals(10, manual(35, { exerciseSourceId: "E90", label: "Diez paladas potentes" }), 90, "Remo fácil"))
    ], { phaseGuidance: { ...ROWER_PHASE_GUIDANCE, work: "Realiza diez paladas potentes sin aumentar innecesariamente la cadencia." } }),
    R47: protocol(["E91"], [
      option("short", "20 minutos", 3 * 60, 3 * 60, [work(14 * 60, "E91", "Caminata cómoda")]),
      option("standard", "25 minutos", 4 * 60, 4 * 60, [work(17 * 60, "E91", "Caminata cómoda")]),
      option("long", "30 minutos", 5 * 60, 5 * 60, [work(20 * 60, "E91", "Caminata cómoda")])
    ], { warmupCue: "Camina muy suave y encuentra una zancada cómoda.", cooldownCue: "Reduce el ritmo de forma gradual.", phaseGuidance: { ...DEFAULT_PHASE_GUIDANCE, work: "Camina a un ritmo cómodo de recuperación." } }),
    R48: protocol(["E91"], [
      option("short", "30 minutos", 5 * 60, 5 * 60, [work(20 * 60, "E91", "Caminata a paso ligero")]),
      option("standard", "38 minutos", 5 * 60, 5 * 60, [work(28 * 60, "E91", "Caminata a paso ligero")]),
      option("long", "45 minutos", 5 * 60, 5 * 60, [work(35 * 60, "E91", "Caminata a paso ligero")])
    ], { warmupCue: "Camina suave antes de aumentar el paso.", cooldownCue: "Reduce el ritmo de forma gradual.", phaseGuidance: { ...DEFAULT_PHASE_GUIDANCE, work: "Camina con energía a un ritmo que todavía puedas controlar." } }),
    R49: protocol(["E91"], [
      option("short", "45 minutos", 5 * 60, 5 * 60, [work(35 * 60, "E91", "Caminata sostenible")]),
      option("standard", "52 minutos", 5 * 60, 5 * 60, [work(42 * 60, "E91", "Caminata sostenible")]),
      option("long", "60 minutos", 5 * 60, 5 * 60, [work(50 * 60, "E91", "Caminata sostenible")])
    ], { warmupCue: "Camina suave y estabiliza la respiración.", cooldownCue: "Reduce el ritmo de forma gradual.", phaseGuidance: { ...DEFAULT_PHASE_GUIDANCE, work: "Mantén una zancada natural y un ritmo sostenible." } }),

    H01: rowerProtocol(["E88"], [8, 10, 12].map((count, index) => option(["short", "standard", "long"][index], ["8 intervalos", "10 intervalos", "12 intervalos"][index], 6 * 60, 5 * 60, repeatedIntervals(count, work(60, "E88", "Remo fuerte"), 60, "Remo fácil")))),
    H02: rowerProtocol(["E88"], [8, 9, 10].map((count, index) => option(["short", "standard", "long"][index], [`2 bloques de ${count}`, `2 bloques de ${count}`, `2 bloques de ${count}`][index], 6 * 60, 5 * 60, [
      ...repeatedIntervals(count, work(30, "E88", "Remo fuerte"), 30, "Remo fácil", true),
      ...[recover(180, "Remo muy suave entre bloques")],
      ...repeatedIntervals(count, work(30, "E88", "Remo fuerte"), 30, "Remo fácil", true)
    ]))),
    H03: rowerProtocol(["E88"], [6, 8, 10].map((secondBlock, index) => option(["short", "standard", "long"][index], [`10 + ${secondBlock} intervalos`, `10 + ${secondBlock} intervalos`, `10 + ${secondBlock} intervalos`][index], 6 * 60, 5 * 60, [
      ...repeatedIntervals(10, work(40, "E88", "Remo fuerte"), 20, "Remo fácil", true),
      recover(180, "Remo suave entre bloques"),
      ...repeatedIntervals(secondBlock, work(40, "E88", "Remo fuerte"), 20, "Remo fácil", true)
    ]))),
    H04: rowerProtocol(["E89"], [8, 9, 10].map((count, index) => option(["short", "standard", "long"][index], [`${count} aceleraciones`, `${count} aceleraciones`, `${count} aceleraciones`][index], 10 * 60, 5 * 60, repeatedIntervals(count, work(20, "E89", "Aceleración muy fuerte"), 100, "Remo fácil", true))), { phaseGuidance: { ...ROWER_PHASE_GUIDANCE, work: "Rema muy fuerte durante la aceleración sin perder la técnica." } }),
    H05: rowerProtocol(["E88"], [option("standard", "4 intervalos", 6 * 60, 5 * 60, repeatedIntervals(4, work(240, "E88", "Remo fuerte"), 180, "Remo fácil", false))]),
    H06: rowerProtocol(["E88"], [
      option("short", "8 repeticiones", 6 * 60, 5 * 60, repeatedIntervals(8, manual(50, { exerciseSourceId: "E88", label: "250 m fuertes" }), 75, "Remo suave")),
      option("standard", "10 repeticiones", 6 * 60, 5 * 60, repeatedIntervals(10, manual(50, { exerciseSourceId: "E88", label: "250 m fuertes" }), 82, "Remo suave")),
      option("long", "12 repeticiones", 6 * 60, 5 * 60, repeatedIntervals(12, manual(50, { exerciseSourceId: "E88", label: "250 m fuertes" }), 90, "Remo suave"))
    ], { phaseGuidance: { ...ROWER_PHASE_GUIDANCE, work: "Completa 250 m fuertes a un ritmo repetible." } }),
    H07: rowerProtocol(["E88"], [12, 15, 18].map((minutes, index) => option(["short", "standard", "long"][index], `${minutes} minutos`, 6 * 60, 5 * 60, repeatedRounds(minutes, [recover(30, "Remo suave"), work(20, "E88", "Remo fuerte y controlado", { guidance: "Rema fuerte y de forma controlada." }), work(10, "E88", "Remo muy fuerte", { guidance: "Rema muy fuerte durante diez segundos." })])))),
    H08: rowerProtocol(["E90"], [
      option("short", "8 rondas", 6 * 60, 5 * 60, repeatedIntervals(8, manual(30, { exerciseSourceId: "E90", label: "Diez paladas potentes" }), 50, "Remo suave")),
      option("standard", "9 rondas", 6 * 60, 5 * 60, repeatedIntervals(9, manual(30, { exerciseSourceId: "E90", label: "Diez paladas potentes" }), 60, "Remo suave")),
      option("long", "10 rondas", 6 * 60, 5 * 60, repeatedIntervals(10, manual(30, { exerciseSourceId: "E90", label: "Diez paladas potentes" }), 70, "Remo suave"))
    ], { phaseGuidance: { ...ROWER_PHASE_GUIDANCE, work: "Haz diez paladas potentes y técnicamente limpias." } }),
    H09: protocol(["E65"], [12, 14, 15].map((count, index) => option(["short", "standard", "long"][index], `${count} intervalos`, 5 * 60, 5 * 60, repeatedIntervals(count, work(20, "E65", "Balanceo con pesa rusa"), 40)))),
    H10: protocol(["E65"], [
      option("short", "Un bloque", 8 * 60, 5 * 60, repeatedIntervals(8, work(20, "E65", "Balanceo en formato Tabata"), 10)),
      option("long", "Dos bloques", 8 * 60, 5 * 60, [...repeatedIntervals(8, work(20, "E65", "Balanceo en formato Tabata"), 10), recover(240, "Recuperación entre bloques"), ...repeatedIntervals(8, work(20, "E65", "Balanceo en formato Tabata"), 10)])
    ], { phaseGuidance: { ...DEFAULT_PHASE_GUIDANCE, work: "Realiza balanceos potentes y detente si se degrada la técnica." } }),
    H11: protocol(["E66"], [5, 6, 7].map((count, index) => option(["short", "standard", "long"][index], `${count} ciclos`, 5 * 60, 5 * 60, repeatedRounds(count, [work(30, "E66", "Balanceo con el lado derecho"), recover(30), work(30, "E66", "Balanceo con el lado izquierdo")], 30, "Recuperación después del ciclo", true)))),
    H12: protocol(["E45", "E65"], [6, 7, 8].map((count, index) => option(["short", "standard", "long"][index], `${count} rondas`, 5 * 60, 5 * 60, repeatedRounds(count, [work(30, "E45", "Sentadilla de copa"), recover(30), work(30, "E65", "Balanceo con pesa rusa")], 30, "Recuperación después de la ronda", true)))),
    H13: protocol(["E83"], [12, 14, 16].map((count, index) => option(["short", "standard", "long"][index], `${count} minutos`, 5 * 60, 5 * 60, Array.from({ length: count }, (_, minute) => {
      const side = minute % 2 ? "izquierdo" : "derecho";
      return work(60, "E83", `Cargada y press con el lado ${side}`, { activeSeconds: 30, guidance: `Haz las repeticiones con el lado ${side} y descansa el tiempo restante.`, round: minute + 1, roundCount: count, workStep: 1, workStepsPerRound: 1 });
    })))),
    H14: protocol(["E65", "E67"], [8, 9, 10].map((count, index) => option(["short", "standard", "long"][index], `${count} rondas`, 5 * 60, 5 * 60, windowedIntervals(count, 90, "E65", "Diez balanceos y cargadas por lado", 60)))),
    H15: protocol(["E68", "E69"], [[8, 20, 60], [10, 25, 75], [12, 30, 90]].map(([count, seconds, rest], index) => option(["short", "standard", "long"][index], `${count} esfuerzos`, 8 * 60, 5 * 60, variableRounds(count, (round) => [work(seconds, round % 2 ? "E68" : "E69", round % 2 ? "Tirón alto de potencia" : "Arrancada de potencia")], rest)))),
    H16: protocol(["E45", "E65", "E83", "E78"], [3, 4].map((count, index) => option(index ? "long" : "standard", `${count} rondas`, 5 * 60, 5 * 60, repeatedRounds(count, [work(40, "E45", "Sentadilla de copa"), recover(20), work(40, "E65", "Balanceo"), recover(20), work(40, "E83", "Cargada y press alternante"), recover(20), work(40, "E78", "Paseo de maleta con el lado derecho"), recover(20), work(40, "E78", "Paseo de maleta con el lado izquierdo")], 60, "Recuperación después de la ronda", true)))),
    H17: protocol(["E46", "E57", "E29", "E07", "E82"], [3, 4].map((count, index) => option(index ? "long" : "standard", `${count} rondas`, 5 * 60, 5 * 60, circuit(count, [[40, "E46", "Sentadilla frontal", {}, 20], [40, "E57", "Peso muerto rumano", {}, 20], [40, "E29", "Remo inclinado", {}, 20], [40, "E07", "Press militar", {}, 20], [40, "E82", "Sentadilla con press"]], 120)))),
    H18: protocol(["E45", "E51", "E57", "E53"], [4, 5].map((count, index) => option(index ? "long" : "standard", `${count} rondas`, 5 * 60, 5 * 60, circuit(count, [[40, "E45", "Sentadilla de copa", {}, 20], [40, "E51", "Zancada atrás alternante", {}, 20], [40, "E57", "Peso muerto rumano", {}, 20], [40, "E53", "Zancada lateral alternante"]], 90)))),
    H19: protocol(["E56", "E57", "E29", "E77"], [option("standard", "4 rondas", 5 * 60, 5 * 60, circuit(4, [[45, "E56", "Peso muerto con mancuernas", {}, 15], [45, "E57", "Peso muerto rumano", {}, 15], [45, "E29", "Remo inclinado", {}, 15], [45, "E77", "Paseo del granjero"]], 60))]),
    H20: protocol(["E08", "E29", "E40", "E77"], [4, 5].map((count, index) => option(index ? "long" : "standard", `${count} rondas`, 5 * 60, 5 * 60, circuit(count, [[40, "E08", "Press de impulso", {}, 20], [40, "E29", "Remo inclinado", {}, 20], [40, "E40", "Encogimiento de hombros", {}, 20], [40, "E77", "Paseo del granjero"]], 90, true)))),
    H21: protocol(["E82"], [10, 12, 15].map((count, index) => option(["short", "standard", "long"][index], `${count} intervalos`, 5 * 60, 5 * 60, repeatedIntervals(count, work(20, "E82", "Sentadilla con press"), 40)))),
    H22: protocol(["E49", "E58", "E78"], [option("standard", "3 rondas", 5 * 60, 5 * 60, repeatedRounds(3, [work(30, "E49", "Sentadilla dividida derecha"), recover(30), work(30, "E49", "Sentadilla dividida izquierda"), recover(30), work(30, "E58", "Peso muerto rumano unilateral derecho"), recover(30), work(30, "E58", "Peso muerto rumano unilateral izquierdo"), recover(30), work(30, "E78", "Paseo de maleta derecho"), recover(30), work(30, "E78", "Paseo de maleta izquierdo")], 30, "Recuperación después de la ronda", true))]),
    H23: protocol(["E46", "E57", "E29", "E08"], [6, 7, 8].map((count, index) => option(["short", "standard", "long"][index], `${count} ciclos`, 5 * 60, 5 * 60, windowedIntervals(count, 180, "E46", "Complejo de cuatro ejercicios", 120)))),
    H24: protocol(["E45", "E57", "E29", "E07"], [option("standard", "5 rondas", 5 * 60, 5 * 60, repeatedRounds(5, [work(30, "E45", "Sentadilla de copa"), recover(30), work(30, "E57", "Peso muerto rumano"), recover(30), work(30, "E29", "Remo inclinado"), recover(30), work(30, "E07", "Press militar")], 30, "Recuperación después de la ronda", true))]),
    H25: protocol(["E01", "E28", "E21"], [option("standard", "4 rondas", 5 * 60, 5 * 60, repeatedRounds(4, [work(40, "E01", "Press plano"), recover(20), work(40, "E28", "Remo unilateral derecho"), recover(20), work(40, "E28", "Remo unilateral izquierdo"), recover(20), work(40, "E21", "Flexión inclinada")], 90, "Recuperación después de la ronda", true))]),
    H26: protocol(["E03", "E30"], [8, 10, 12].map((count, index) => {
      const pause = [60, 75, 90][index];
      const segments = [];
      for (let pair = 1; pair <= count; pair += 1) {
        segments.push(work(45, "E03", "Press inclinado"), transition(15, "Cambio de ejercicio"), work(45, "E30", "Remo con el pecho apoyado"));
        if (pair < count) segments.push(pair % 4 === 0 ? recover(pause, "Recuperación adicional") : transition(15, "Cambio de ejercicio"));
      }
      return option(["short", "standard", "long"][index], `${count} pares`, 5 * 60, 5 * 60, segments);
    })),
    H27: protocol(["E50", "E63", "E64"], [option("standard", "4 rondas", 5 * 60, 5 * 60, repeatedRounds(4, [work(40, "E50", "Sentadilla búlgara derecha"), recover(20), work(40, "E50", "Sentadilla búlgara izquierda"), recover(20), work(40, "E63", "Empuje de cadera"), recover(20), work(40, "E64", "Empuje de cadera unilateral alternante")], 90, "Recuperación después de la ronda", true))]),
    H28: protocol(["E50", "E63", "E03", "E30"], [option("standard", "Dos bloques", 5 * 60, 5 * 60, [
      ...repeatedRounds(3, [work(40, "E50", "Sentadilla búlgara derecha"), recover(20), work(40, "E50", "Sentadilla búlgara izquierda"), recover(20), work(40, "E63", "Empuje de cadera"), recover(20)]),
      transition(90, "Ajusta el banco a 30–40°"),
      ...repeatedRounds(4, [work(40, "E03", "Press inclinado"), recover(20), work(40, "E30", "Remo con el pecho apoyado"), recover(20)])
    ])]),
    H29: protocol(["E06", "E30", "E01"], [option("standard", "Tres bloques", 5 * 60, 5 * 60, [
      ...repeatedIntervals(6, work(30, "E06", "Press de hombro"), 30), transition(90, "Ajusta el banco a 30–40°"),
      ...repeatedIntervals(6, work(30, "E30", "Remo con el pecho apoyado"), 30), transition(90, "Coloca el banco a 0°"),
      ...repeatedIntervals(6, work(30, "E01", "Press plano"), 30)
    ])]),
    H30: protocol(["E01", "E28", "E63", "E50"], [4, 5].map((count, index) => option(index ? "long" : "standard", `${count} rondas`, 5 * 60, 5 * 60, circuit(count, [[40, "E01", "Press plano", {}, 20], [40, "E28", "Remo unilateral alternante", {}, 20], [40, "E63", "Empuje de cadera", {}, 20], [40, "E50", "Sentadilla búlgara alternante"]], 90, true)))),
    H31: protocol(["E14", "E33", "E35", "E74"], [4, 5].map((count, index) => option(index ? "long" : "standard", `${count} rondas`, 5 * 60, 5 * 60, circuit(count, [[40, "E14", "Press de pecho con banda", {}, 20], [40, "E33", "Remo con banda", {}, 20], [40, "E35", "Remo alto con banda", {}, 20], [40, "E74", "Presión antirotación"]], 60, true)))),
    H32: protocol(["E38", "E37", "E36", "E18"], [option("standard", "4 rondas", 5 * 60, 5 * 60, circuit(4, [[40, "E38", "Jalón al pecho", {}, 20], [40, "E37", "Jalón con brazos rectos", {}, 20], [40, "E36", "Tirón hacia la cara", {}, 20], [40, "E18", "Extensión de tríceps"]], 60, true))]),
    H33: protocol(["E62", "E76", "E16"], [option("standard", "4 rondas", 5 * 60, 5 * 60, repeatedRounds(4, [work(40, "E62", "Tracción entre las piernas"), recover(20), work(40, "E76", "Elevación diagonal derecha"), recover(20), work(40, "E76", "Elevación diagonal izquierda"), recover(20), work(40, "E16", "Apertura de abajo hacia arriba")], 60, "Recuperación después de la ronda", true))]),
    H34: protocol(["E47", "E60", "E61"], [option("standard", "5 rondas", 5 * 60, 5 * 60, repeatedRounds(5, [work(40, "E47", "Sentadilla con barra y banda"), recover(20), work(40, "E60", "Peso muerto rumano con banda"), recover(20), work(40, "E61", "Buenos días con banda")], 75, "Recuperación después de la ronda", true))]),
    H35: protocol(["E47", "E60", "E24", "E44"], [option("standard", "4 rondas", 5 * 60, 5 * 60, circuit(4, [[40, "E47", "Sentadilla con barra y banda", {}, 20], [40, "E60", "Peso muerto rumano con banda", {}, 20], [40, "E24", "Press vertical con banda", {}, 20], [40, "E44", "Curl con banda"]], 90, true))]),
    H36: protocol(["E74", "E75", "E76"], [option("standard", "Tres bloques", 5 * 60, 5 * 60, [
      ...repeatedIntervals(6, work(30, "E74", "Presión antirotación alternando lados"), 30), transition(90, "Cambia al anclaje alto"),
      ...repeatedIntervals(6, work(30, "E75", "Corte diagonal alternando lados"), 30), transition(90, "Cambia al anclaje bajo"),
      ...repeatedIntervals(6, work(30, "E76", "Elevación diagonal alternando lados"), 30)
    ])]),
    H37: protocol(["E14", "E33", "E35", "E74"], [option("standard", "5 rondas", 5 * 60, 5 * 60, repeatedRounds(5, [work(30, "E14", "Press de pecho con banda"), recover(30), work(30, "E33", "Remo con banda"), recover(30), work(30, "E35", "Remo alto con banda"), recover(30), work(30, "E74", "Presión antirotación")], 30, "Recuperación después de la ronda", true))]),
    H38: protocol(["E47", "E60", "E24", "E14", "E33"], [option("standard", "Dos bloques", 5 * 60, 5 * 60, [
      ...repeatedRounds(3, [work(40, "E47", "Sentadilla con banda"), recover(20), work(40, "E60", "Peso muerto rumano con banda"), recover(20), work(40, "E24", "Press vertical con banda"), recover(20)]),
      transition(90, "Prepara el anclaje medio"),
      ...repeatedRounds(4, [work(40, "E14", "Press de pecho con banda"), recover(20), work(40, "E33", "Remo con banda"), recover(20)])
    ])]),
    H39: protocol(["E25", "E72", "E26"], [4, 5].map((count, index) => option(index ? "long" : "standard", `${count} vueltas completas`, 5 * 60, 5 * 60, repeatedRounds(count, [
      work(90, "E25", "Dominada pronada y descanso restante", { activeSeconds: 30, guidance: "Haz las dominadas pronadas y descansa el tiempo restante." }),
      work(90, "E72", "Elevación de rodillas y descanso restante", { activeSeconds: 30, guidance: "Haz las elevaciones de rodillas y descansa el tiempo restante." }),
      work(90, "E26", "Dominada neutra y descanso restante", { activeSeconds: 30, guidance: "Haz las dominadas neutras y descansa el tiempo restante." })
    ])))),
    H40: protocol(["E21", "E48", "E22", "E64"], [4, 5].map((count, index) => option(index ? "long" : "standard", `${count} rondas`, 5 * 60, 5 * 60, circuit(count, [[40, "E21", "Flexión inclinada", {}, 20], [40, "E48", "Sentadilla hacia el banco", {}, 20], [40, "E22", "Flexión con pies elevados", {}, 20], [40, "E64", "Empuje de cadera unilateral"]], 60, true)))),
    H41: protocol(["E70", "E71"], [4, 5, 6].map((count, index) => option(["short", "standard", "long"][index], `${count} ciclos`, 5 * 60, 5 * 60, repeatedRounds(count, [work(30, "E70", "Abdominal corto declinado"), recover(30), work(30, "E71", "Incorporación declinada")], 30, "Recuperación después del ciclo", true)))),
    H42: protocol(["E25", "E26"], [[8, 20, 75], [10, 25, 90], [12, 30, 105]].map(([count, seconds, rest], index) => option(["short", "standard", "long"][index], `${count} agrupaciones`, 5 * 60, 5 * 60, variableRounds(count, (round) => [manual(seconds, { exerciseSourceId: round % 2 ? "E25" : "E26", label: round % 2 ? "Dominadas pronadas rápidas y controladas" : "Dominadas neutras rápidas y controladas" })], rest)))),
    H43: rowerProtocol(["E88", "E65"], [6, 8, 10].map((count, index) => option(["short", "standard", "long"][index], `${count} rondas`, 6 * 60, 5 * 60, repeatedRounds(count, [work(45, "E88", "Remo fuerte"), transition(15, "Cambio a la pesa rusa"), work(30, "E65", "Balanceo con pesa rusa")], 30, "Recuperación después de la ronda", true)))),
    H44: rowerProtocol(["E88", "E83"], [6, 7, 8].map((count, index) => option(["short", "standard", "long"][index], `${count} rondas`, 6 * 60, 5 * 60, repeatedRounds(count, [work(45, "E88", "Remo fuerte"), transition(15, "Cambio a la pesa rusa"), work(30, "E83", "Cargada y press alternante")], 60, "Recuperación después de la ronda", true)))),
    H45: rowerProtocol(["E88", "E46", "E51"], [option("standard", "8 rondas", 6 * 60, 5 * 60, variableRounds(8, (round) => [work(45, "E88", "Remo fuerte"), transition(15, "Cambio a las mancuernas"), work(30, round % 2 ? "E46" : "E51", round % 2 ? "Sentadilla frontal" : "Zancada atrás alternante")], 30))]),
    H46: rowerProtocol(["E88", "E08", "E29"], [option("standard", "8 rondas", 6 * 60, 5 * 60, variableRounds(8, (round) => [work(45, "E88", "Remo fuerte"), transition(15, "Cambio a las mancuernas"), work(30, round % 2 ? "E08" : "E29", round % 2 ? "Press de impulso" : "Remo inclinado")], 30))]),
    H47: rowerProtocol(["E88", "E14", "E33"], [option("standard", "8 rondas", 6 * 60, 5 * 60, variableRounds(8, (round) => [work(45, "E88", "Remo fuerte"), transition(15, "Cambio a las bandas"), work(40, round % 2 ? "E14" : "E33", round % 2 ? "Press de pecho con banda" : "Remo con banda")], 40))]),
    H48: rowerProtocol(["E88", "E25", "E26"], [
      option("short", "6 rondas", 6 * 60, 5 * 60, variableRounds(6, (round) => [work(45, "E88", "Remo fuerte"), transition(15, "Cambio a dominadas"), manual(20, { exerciseSourceId: round % 2 ? "E25" : "E26", label: round % 2 ? "Dominadas pronadas controladas" : "Dominadas neutras controladas" })], 75)),
      option("standard", "7 rondas", 6 * 60, 5 * 60, variableRounds(7, (round) => [work(52, "E88", "Remo fuerte"), transition(15, "Cambio a dominadas"), manual(25, { exerciseSourceId: round % 2 ? "E25" : "E26", label: round % 2 ? "Dominadas pronadas controladas" : "Dominadas neutras controladas" })], 82)),
      option("long", "8 rondas", 6 * 60, 5 * 60, variableRounds(8, (round) => [work(60, "E88", "Remo fuerte"), transition(15, "Cambio a dominadas"), manual(30, { exerciseSourceId: round % 2 ? "E25" : "E26", label: round % 2 ? "Dominadas pronadas controladas" : "Dominadas neutras controladas" })], 90))
    ])
  };

  const REST_OVERRIDES = {
    R01: { E01: [120, 150, 180], E02: [90, 105, 120], default: [60, 75, 90] },
    R02: { E03: [90, 120, 150], E04: [90, 120, 150], E05: [90, 120, 150], E10: [60, 75, 90] },
    R03: { default: [60, 75, 90] },
    R04: { E06: [120, 135, 150], E07: [120, 135, 150], default: [60, 75, 90] },
    R05: { E08: [120, 150, 180], default: [60, 75, 90] },
    R07: { E27: [120, 120, 120], E25: [120, 120, 120], E26: [120, 120, 120], default: [60, 75, 90] },
    R10: { default: [60, 75, 90] },
    R15: { default: [90, 135, 180] },
    R17: { default: [45, 60, 75] }
  };

  function fallbackRest(prescription) {
    const normalized = String(prescription || "").replaceAll("-", "–");
    const timedMatch = normalized.match(/\d+(?:–\d+)?\s*(?:s|min)/i);
    if (timedMatch) return [45, 60, 75];
    const repMatch = normalized.match(/×\s*\d+(?:–(\d+))?/);
    const maximum = repMatch ? Number(repMatch[1] || normalized.match(/×\s*(\d+)/)?.[1]) : 12;
    if (maximum <= 6) return [90, 120, 150];
    if (maximum <= 12) return [75, 90, 120];
    return [45, 60, 75];
  }

  function restFor(routineId, sourceId, prescription) {
    const overrides = REST_OVERRIDES[routineId];
    const values = overrides?.[sourceId] || overrides?.default || fallbackRest(prescription);
    return { minimumSeconds: values[0], defaultSeconds: values[1], maximumSeconds: values[2] };
  }

  function variantMetrics(variant) {
    const mainSeconds = variant.segments.reduce((sum, segment) => sum + (segment.durationSeconds ?? segment.estimatedSeconds), 0);
    const workSeconds = variant.segments.reduce((sum, segment) => sum + (segment.activeSeconds || 0), 0);
    return {
      warmupSeconds: variant.warmupSeconds,
      mainSeconds,
      workSeconds,
      recoverySeconds: Math.max(0, mainSeconds - workSeconds),
      cooldownSeconds: variant.cooldownSeconds,
      totalSeconds: variant.warmupSeconds + mainSeconds + variant.cooldownSeconds
    };
  }

  function guidanceForSegment(segment, definition) {
    if (segment.guidance) return segment.guidance;
    if (segment.kind === "transition") return segment.label || definition.phaseGuidance.transition;
    const hasRower = definition.exerciseSourceIds.some((sourceId) => /^E(?:8[5-9]|90)$/.test(sourceId));
    const rowerOnly = definition.exerciseSourceIds.every((sourceId) => /^E(?:8[5-9]|90)$/.test(sourceId));
    if (segment.kind === "recovery") return hasRower && !rowerOnly ? `${segment.label || "Descansa antes de la siguiente ronda"}.` : definition.phaseGuidance.recovery;
    if (/^E(?:8[5-9]|90|91)$/.test(segment.exerciseSourceId || "")) return definition.phaseGuidance.work;
    const label = String(segment.label || "el ejercicio").replace(/[.!?]+$/g, "");
    return `Realiza ${label.charAt(0).toLocaleLowerCase("es")}${label.slice(1)} con técnica controlada.`;
  }

  function compileProtocol(routineId, exerciseBySourceId) {
    const definition = definitions[routineId];
    if (!definition) return null;
    const sourceIds = [...new Set(definition.exerciseSourceIds)];
    const movementIndexes = new Map(sourceIds.map((sourceId, index) => [sourceId, index]));
    for (const sourceId of sourceIds) if (!exerciseBySourceId.has(sourceId)) throw new Error(`${routineId}: el protocolo referencia ${sourceId}, que no existe.`);
    const variants = definition.variants.map((variant) => ({
      ...variant,
      metrics: variantMetrics(variant),
      segments: variant.segments.map((segment) => ({
        ...segment,
        guidance: guidanceForSegment(segment, definition),
        movementIndex: segment.exerciseSourceId ? movementIndexes.get(segment.exerciseSourceId) : null
      }))
    }));
    return { ...definition, exerciseSourceIds: sourceIds, variants };
  }

  function protocolDuration(protocolDefinition) {
    const totals = protocolDefinition.variants.map((variant) => variant.metrics.totalSeconds);
    const defaultVariant = protocolDefinition.variants.find((variant) => variant.id === protocolDefinition.defaultVariantId) || protocolDefinition.variants[0];
    const durationRange = [Math.round(Math.min(...totals) / 60), Math.round(Math.max(...totals) / 60)];
    return {
      durationRange,
      durationLabel: durationRange[0] === durationRange[1] ? `${durationRange[0]} min totales` : `${durationRange[0]}–${durationRange[1]} min totales`,
      estimatedMinutes: Math.round(defaultVariant.metrics.totalSeconds / 60),
      plannedSeconds: defaultVariant.metrics.totalSeconds,
      durationBasis: "session",
      durationBreakdown: { variantId: defaultVariant.id, variantLabel: defaultVariant.label, ...defaultVariant.metrics }
    };
  }

  function durationOverride(routineId) {
    if (routineId === "R46") return { durationRange: [35, 50], durationLabel: "35–50 min totales", estimatedMinutes: 42, durationBasis: "session" };
    return null;
  }

  return { definitions, compileProtocol, protocolDuration, durationOverride, restFor, variantMetrics };
});
