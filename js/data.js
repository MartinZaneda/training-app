/* Inventario y configuración de la aplicación. La biblioteca canónica vive en js/exercises.js. */
(function () {
  "use strict";

  const exercises = window.TrainingExercises;
  if (!Array.isArray(exercises) || exercises.length !== 91) throw new Error("La biblioteca de ejercicios E01–E91 no se ha cargado.");
  const muscleMetadata = Object.fromEntries(exercises.map((exercise) => [exercise.id, {
    primaryMuscle: exercise.primaryMuscle,
    primaryMuscles: exercise.primaryMuscles,
    secondaryMuscles: exercise.secondaryMuscles
  }]));

  const profiles = {
    personal: {
      id: "personal",
      name: "Mi perfil"
    }
  };

  const weeklyPresets = [
    {
      id: "upper-priority",
      title: "Prioridad al tren superior",
      icon: "dumbbell",
      description: "Tres sesiones específicas de tren superior, una de tren inferior para mantener el equilibrio y remo aeróbico de apoyo.",
      summary: "5 sesiones · 2 días de descanso",
      schedule: ["R21", "R22", null, "R26", "R23", "R38", null]
    },
    {
      id: "lower-priority",
      title: "Prioridad al tren inferior",
      icon: "foot",
      description: "Tres sesiones centradas en cuádriceps, glúteos y cadena posterior, una de mantenimiento del tren superior y remo aeróbico.",
      summary: "5 sesiones · 2 días de descanso",
      schedule: ["R11", null, "R14", "R23", null, "R16", "R38"]
    },
    {
      id: "conditioning-priority",
      title: "Alta intensidad y pérdida de peso",
      icon: "flame",
      description: "Tres sesiones de intervalos alternadas con fuerza de cuerpo completo, remo aeróbico y dos días de recuperación.",
      summary: "5 sesiones · 2 días de descanso",
      schedule: ["H01", "R30", null, "H24", "R38", "H12", null]
    }
  ];

  const effortLevels = [
    { id: "easy", label: "Fácil", action: "Subir carga", advice: "Próxima vez, prueba con un poco más de carga o resistencia.", icon: "smile" },
    { id: "normal", label: "Normal", action: "Mantener", advice: "Próxima vez, mantén la misma carga o resistencia.", icon: "neutral" },
    { id: "hard", label: "Difícil", action: "Bajar carga", advice: "Próxima vez, prueba con un poco menos de carga o resistencia.", icon: "frown" }
  ];

  window.TrainingData = {
    appVersion: 6,
    days: ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"],
    exercises,
    muscleMetadata,
    routines: {},
    profiles,
    weeklyPresets,
    effortLevels,
    equipment: [
      {
        id: "smartbells-pro",
        icon: "dumbbell",
        category: "Mancuernas ajustables",
        quantity: 2,
        name: "BRAINGAIN SmartBells™ Pro",
        detail: "4–41,5 kg por mancuerna · 26 ajustes",
        description: "Cada unidad sustituye un rack completo. El peso del entrenamiento se registra siempre por mancuerna, no como suma del par.",
        image: "public/equipment-images/smartbells-pro.webp",
        imageAlt: "Par de mancuernas ajustables BRAINGAIN SmartBells Pro sobre sus bases",
        routineTaxonomy: ["DB"],
        selection: { modality: "smartbells-pro", type: "load", label: "Mancuernas ajustables", fieldLabel: "Peso por mancuerna", seriesFieldLabel: "kg por mancuerna", summaryUnit: "kg por mancuerna" },
        variantsLabel: "26 ajustes por unidad",
        variants: ["4", "5,5", "7", "8,5", "10", "11,5", "13", "14,5", "16", "17,5", "19", "20,5", "22", "23,5", "25", "26,5", "28", "29,5", "31", "32,5", "34", "35,5", "37", "38,5", "40", "41,5"],
        unit: "kg",
        note: "Selecciona la carga con la mancuerna apoyada en su base, comprueba el bloqueo y no la dejes caer."
      },
      {
        id: "pesa-rusa-ajustable",
        icon: "weight",
        category: "Pesa rusa ajustable",
        quantity: 1,
        name: "BRAINGAIN pesa rusa ajustable",
        detail: "4–18 kg · 7 ajustes",
        description: "Una única pesa rusa compacta con placas seleccionables. No se presupone una segunda unidad para ningún ejercicio.",
        image: "public/equipment-images/pesa-rusa-ajustable.webp",
        imageAlt: "Pesa rusa ajustable BRAINGAIN negra y azul de 18 kg",
        routineTaxonomy: ["KB"],
        selection: { modality: "pesa-rusa-ajustable", type: "load", label: "Pesa rusa ajustable", fieldLabel: "Peso de la pesa rusa", seriesFieldLabel: "kg de la pesa rusa", summaryUnit: "kg" },
        variantsLabel: "7 ajustes exactos",
        variants: ["4", "6", "8", "11", "13", "16", "18"],
        unit: "kg",
        note: "Ajusta las placas y confirma que el mecanismo queda bloqueado antes de levantarla."
      },
      {
        id: "super-bench-pro-v2",
        icon: "bench",
        category: "Banco ajustable",
        quantity: 1,
        name: "Banco ajustable Ironmaster Super Bench Pro",
        detail: "11 ángulos · 0°–85° · 4 accesorios",
        description: "Banco plano, inclinado y vertical con asiento extraíble y accesorios específicos del sistema Ironmaster.",
        image: "public/equipment-images/super-bench-pro-v2.webp",
        imageAlt: "Banco ajustable Ironmaster Super Bench PRO V2 en posición inclinada",
        routineTaxonomy: ["banco", "BENCH", "DB+B0", "DB+BI", "DB0", "DBI"],
        selection: { modality: "super-bench-pro-v2", type: "fixed", label: "Banco ajustable", seriesFieldLabel: "Material utilizado", staticValue: "Banco ajustable Ironmaster Super Bench Pro" },
        variantsLabel: "11 posiciones del respaldo",
        variants: ["0°", "5°", "10°", "20°", "30°", "40°", "50°", "60°", "70°", "80°", "85°"],
        accessories: [
          {
            id: "asiento-inclinado",
            parentId: "super-bench-pro-v2",
            name: "Asiento inclinado extraíble",
            category: "Accesorio de banco",
            detail: "Asiento auxiliar para las posiciones inclinadas",
            image: "public/equipment-images/attachments/asiento-inclinado.webp",
            imageAlt: "Asiento inclinado extraíble Ironmaster para Super Bench PRO"
          },
          {
            id: "crunch-situp",
            parentId: "super-bench-pro-v2",
            routineTaxonomy: ["CR", "Crunch", "ATT-CR"],
            selection: { modality: "crunch-situp", type: "fixed", label: "Accesorio para abdominales", seriesFieldLabel: "Material utilizado", staticValue: "Accesorio para abdominales" },
            name: "Accesorio para abdominales",
            category: "Accesorio de banco",
            detail: "Rodillos acolchados para abdominales en declive",
            image: "public/equipment-images/attachments/crunch-situp.webp",
            imageAlt: "Acople Ironmaster Crunch Situp instalado en el banco"
          },
          {
            id: "chin-up-attachment",
            parentId: "super-bench-pro-v2",
            routineTaxonomy: ["CU", "ChinUp", "ATT-CU"],
            selection: { modality: "chin-up-attachment", type: "fixed", label: "Accesorio de dominadas", seriesFieldLabel: "Material utilizado", staticValue: "Accesorio de dominadas" },
            name: "Accesorio de dominadas",
            category: "Accesorio de banco",
            detail: "Barra multiposición para dominadas",
            image: "public/equipment-images/attachments/barra-dominadas.webp",
            imageAlt: "Acople Ironmaster Chin-Up con barra multiposición"
          },
          {
            id: "extension-cabeza",
            parentId: "super-bench-pro-v2",
            name: "Extensión acolchada para la cabeza",
            category: "Accesorio de banco",
            detail: "Extiende el respaldo y el apoyo de la cabeza",
            image: "public/equipment-images/attachments/extension-cabeza.webp",
            imageAlt: "Almohadilla Ironmaster Head Extension Pad instalada en el banco"
          }
        ],
        note: "Comprueba el pasador, el accesorio y la estabilidad del banco antes de apoyar o cargar peso."
      },
      {
        id: "rogue-echo-rower",
        icon: "waves",
        category: "Cardio",
        quantity: 1,
        name: "Máquina de remo Rogue Echo",
        detail: "Regulador de aire 1–10 · resistencia por aire · pantalla · conectividad inalámbrica",
        description: "Máquina de remo por aire con regulador ajustable. El selector controla el flujo de aire y cambia la sensación de la palada, no la resistencia mecánica.",
        image: "public/equipment-images/rogue-echo-rower.webp",
        imageAlt: "Máquina de remo por aire Rogue Echo Rower negra",
        routineTaxonomy: ["ROW", "Rower"],
        variantsLabel: "10 posiciones del regulador de aire",
        variants: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"],
        specs: ["Regulador de aire 1–10", "Pantalla de 4,7 pulgadas", "Conectividad inalámbrica", "Aplicaciones compatibles con equipos de entrenamiento"],
        selection: { modality: "rogue-echo-rower", type: "damper", label: "Máquina de remo", fieldLabel: "Posición del regulador de aire", seriesFieldLabel: "Regulador de aire", help: "Modifica la sensación de la palada; no es un nivel de dificultad.", defaultValue: 3 },
        note: "Usa 3–5 como punto de partida técnico. El regulador cambia el flujo de aire y la sensación de la palada; 10 no equivale a nivel avanzado ni a diez veces más resistencia."
      },
      {
        id: "rogue-monster-bands",
        icon: "activity",
        category: "Bandas de resistencia",
        quantity: 10,
        name: "Bandas elásticas Rogue Monster",
        detail: "10 bandas · 8 resistencias nominales",
        description: "Bandas cerradas de látex natural de 41 pulgadas. La resistencia indicada corresponde al 100 % de elongación.",
        image: "public/equipment-images/rogue-monster-bands.webp",
        imageAlt: "Juego oficial de bandas elásticas Rogue Monster de varios colores",
        routineTaxonomy: ["BAND", "BAND-FOOT", "BAND-HIGH", "BAND-LOW", "BAND-MED", "bandas", "barra-band", "B-ALTA", "B-BAJA", "B-MED"],
        selection: { modality: "rogue-monster-bands", type: "band", label: "Bandas elásticas", fieldLabel: "Banda", seriesFieldLabel: "Resistencia de la banda" },
        note: "Revisa desgaste y cortes antes de cada uso; nunca dirijas una banda tensada hacia la cara. La resistencia real cambia con el recorrido, la elongación inicial y el punto de sujeción."
      }
    ],
    bands: [
      { id: "#0 Micro", color: "Naranja", quantity: 2, pounds: 9, kgf: "4,1", swatch: "#e77b2d" },
      { id: "#1 Mini", color: "Roja ligera", quantity: 2, pounds: 18, kgf: "8,2", swatch: "#d94a4a" },
      { id: "#2 Mini", color: "Azul", quantity: 1, pounds: 30, kgf: "13,6", swatch: "#3f6fb5" },
      { id: "#3 Light", color: "Verde", quantity: 1, pounds: 40, kgf: "18,1", swatch: "#3f8a62" },
      { id: "#4 Average", color: "Negra", quantity: 1, pounds: 65, kgf: "29,5", swatch: "#28252b" },
      { id: "#5 Strong", color: "Morada", quantity: 1, pounds: 95, kgf: "43,1", swatch: "#76528a" },
      { id: "#6 Strong", color: "Roja fuerte", quantity: 1, pounds: 115, kgf: "52,2", swatch: "#a51f2c" },
      { id: "#7 Super", color: "Plateada", quantity: 1, pounds: 225, kgf: "102,1", swatch: "#9aa0a6" }
    ],
    equipmentAccessories: [
      {
        id: "agarres-individuales",
        quantity: 2,
        name: "Agarres individuales",
        category: "Accesorio para bandas",
        icon: "package",
        parentId: "rogue-monster-bands",
        detail: "Empuñadura metálica y un gancho abierto por agarre",
        description: "Empuñadura metálica con un gancho abierto para conectar una banda elástica.",
        note: "Comprueba que el gancho quede cerrado y que la conexión soporte la dirección de tracción antes de empezar.",
        image: "public/equipment-images/band-accessories/agarres-individuales.webp",
        imageAlt: "Pareja de agarres individuales para bandas con correas grises, empuñaduras metálicas y ganchos negros"
      },
      {
        id: "barra-larga",
        quantity: 1,
        name: "Agarre ancho (barra larga)",
        category: "Accesorio para bandas",
        icon: "package",
        parentId: "rogue-monster-bands",
        detail: "Más de un metro · empuñadura telescópica · un gancho en cada extremo",
        description: "Barra telescópica de agarre ancho con un gancho para bandas en cada extremo.",
        note: "Comprueba ambos ganchos y equilibra la tensión de las bandas antes de levantar la barra.",
        image: "public/equipment-images/band-accessories/barra-larga.webp",
        imageAlt: "Barra larga plateada para bandas con agarres moleteados y un gancho negro en cada extremo"
      }
    ],
    bandAnchors: [
      {
        id: "anclaje-alto",
        parentId: "rogue-monster-bands",
        position: "Anclaje alto",
        name: "Punto fijo alto · alternativa con banco a 85°",
        detail: "Prioriza un punto alto independiente validado. Como alternativa, bloquea el banco exactamente a 85° y monta el accesorio de dominadas; en ese montaje el banco no puede utilizarse simultáneamente como asiento o apoyo.",
        icon: "anchor",
        parentName: "Montaje de bandas",
        note: "El punto debe permanecer inmóvil, no tener cantos que dañen la banda y resistir la tensión en la dirección exacta del ejercicio."
      },
      {
        id: "anclaje-lateral",
        parentId: "rogue-monster-bands",
        position: "Anclaje lateral",
        name: "Punto fijo al lado del ejercicio",
        detail: "Puede utilizarse cualquiera de las opciones laterales disponibles si queda inmóvil y soporta la tracción horizontal prevista.",
        icon: "anchor",
        parentName: "Montaje de bandas",
        note: "El punto debe permanecer inmóvil, no tener cantos que dañen la banda y resistir la tensión en la dirección exacta del ejercicio."
      },
      {
        id: "anclaje-bajo-variable",
        parentId: "rogue-monster-bands",
        position: "Anclaje bajo o variable",
        name: "Montaje adaptado al movimiento",
        detail: "La banda puede fijarse abajo, rodear un apoyo estable o sujetarse con los pies cuando el ejercicio lo permita.",
        icon: "anchor",
        parentName: "Montaje de bandas",
        note: "El punto debe permanecer inmóvil, no tener cantos que dañen la banda y resistir la tensión en la dirección exacta del ejercicio."
      }
    ],
    bandMounting: {
      title: "Anclaje adaptable",
      summary: "Alto · lateral · bajo",
      intro: "Las bandas pueden montarse en diferentes puntos según el ejercicio y la dirección de tracción.",
      guidanceTitle: "El punto puede variar; la comprobación no.",
      guidance: "Debe permanecer inmóvil, no tener cantos que dañen la banda y resistir la tensión en la dirección exacta del ejercicio. Revisa también la banda y los ganchos antes de tirar."
    },
    supports: {
      suelo: {
        id: "suelo",
        name: "Suelo despejado",
        category: "Superficie de apoyo",
        detail: "No requiere material de entrenamiento.",
        description: "Utiliza una superficie estable, seca y con espacio suficiente para completar todo el recorrido.",
        icon: "activity",
        selection: { type: "bodyweight", modality: "bodyweight", label: "Peso corporal", seriesFieldLabel: "Carga utilizada", staticValue: "Peso corporal" },
        note: "Retira objetos cercanos y comprueba que el calzado no resbale."
      },
      calzado: {
        id: "calzado",
        routineTaxonomy: ["calzado"],
        name: "Calzado cómodo",
        category: "Apoyo personal",
        detail: "Calzado adecuado para caminar.",
        description: "Elige un calzado cómodo y un recorrido seguro acorde al terreno.",
        icon: "foot",
        selection: { type: "walking", modality: "walking", label: "Calzado cómodo", seriesFieldLabel: "Material utilizado", staticValue: "Calzado cómodo" },
        note: "Revisa el entorno y adapta la duración a tus sensaciones."
      },
      "sin-equipamiento": {
        id: "sin-equipamiento",
        name: "Sin equipamiento",
        category: "Peso corporal",
        detail: "No requiere material adicional.",
        description: "El ejercicio utiliza únicamente el peso corporal y un espacio despejado.",
        icon: "activity",
        selection: { type: "bodyweight", modality: "bodyweight", label: "Peso corporal", seriesFieldLabel: "Carga utilizada", staticValue: "Peso corporal" },
        note: "Mantén el área libre de obstáculos."
      }
    }
  };
})();
