// Script catalog. Each entry describes its parameters and builds its console
// steps from the current values. Step code is a list of Lua statements with no
// comments and no statement starting with "(": the page joins them into the
// single line the Resolve console expects.

const CLIP_COLORS = [
  ["Pink", "Rosa"],
  ["Orange", "Naranja"],
  ["Apricot", "Albaricoque"],
  ["Yellow", "Amarillo"],
  ["Lime", "Lima"],
  ["Olive", "Oliva"],
  ["Green", "Verde"],
  ["Teal", "Turquesa"],
  ["Navy", "Azul marino"],
  ["Blue", "Azul"],
  ["Purple", "Morado"],
  ["Violet", "Violeta"],
  ["Tan", "Canela"],
  ["Beige", "Beige"],
  ["Brown", "Café"],
  ["Chocolate", "Chocolate"],
];

const TIMECODE_TO_FRAMES = [
  'fps = math.floor(tonumber(tl:GetSetting("timelineFrameRate")) + 0.5)',
  "desde = ((h * 60 + m) * 60 + s) * fps + f",
];

function startFrameLines(values) {
  if (values.from === "all") return [];
  const source = values.from === "playhead" ? "tl:GetCurrentTimecode()" : `("${values.timecode}")`;
  return [
    `h, m, s, f = ${source}:match("(%d+)[:;](%d+)[:;](%d+)[:;](%d+)")`,
    ...TIMECODE_TO_FRAMES,
  ];
}

const CURRENT_TIMELINE =
  "tl = resolve:GetProjectManager():GetCurrentProject():GetCurrentTimeline()";

function audioClipLines(values) {
  if (values.target === "track") {
    return [`clips = tl:GetItemListInTrack("audio", ${values.trackIndex})`];
  }
  return [
    "clips = {}",
    "for _, it in ipairs(tl:GetSelectedClips() or {}) do",
    '  if it:GetType() == "audio" then clips[#clips + 1] = it end',
    "end",
  ];
}

export const scripts = [
  {
    id: "quitar-silencios",
    title: "Quitar los silencios de los audios",
    summary:
      "Recorta las pausas de tus locuciones sin cortar a mano: Resolve detecta los tramos por debajo de un volumen, los borra y cierra el hueco. Funciona sobre los clips que tengas seleccionados o sobre una pista entera.",
    tags: ["Audio", "Silencios", "Cortes"],
    params: [
      {
        key: "target",
        label: "Aplicar a",
        type: "select",
        default: "selected",
        options: [
          ["selected", "Clips seleccionados"],
          ["track", "Toda una pista de audio"],
        ],
      },
      {
        key: "trackIndex",
        label: "Número de pista",
        type: "number",
        default: 1,
        min: 1,
        showIf: (values) => values.target === "track",
      },
      {
        key: "threshold",
        label: "Umbral de silencio (dB)",
        type: "number",
        decimals: true,
        default: -25,
        min: -100,
        max: 10,
        help: "Lo que suene por debajo de esto cuenta como silencio.",
      },
      {
        key: "minimumToStrip",
        label: "Silencio mínimo (frames)",
        type: "number",
        default: 12,
        min: 1,
        help: "Las pausas más cortas se dejan como están.",
      },
      {
        key: "preHead",
        label: "Margen antes de la voz (frames)",
        type: "number",
        default: 2,
        min: 0,
      },
      {
        key: "postTail",
        label: "Margen después de la voz (frames)",
        type: "number",
        default: 2,
        min: 0,
      },
      {
        key: "crossFadeAudio",
        label: "Agregar crossfade en cada corte",
        type: "checkbox",
        default: false,
      },
    ],
    steps(values) {
      return [
        {
          title: "Respaldo (opcional)",
          note: "Duplica el timeline actual con la hora en el nombre, por si el resultado no te gusta.",
          code: [
            CURRENT_TIMELINE,
            'tl:DuplicateTimeline(tl:GetName() .. " respaldo " .. os.date("%H%M%S"))',
          ],
        },
        {
          title: "Quitar silencios",
          note: "Procesa los clips del final hacia el inicio y dice en cuántos lo logró.",
          code: [
            CURRENT_TIMELINE,
            ...audioClipLines(values),
            "table.sort(clips, function(a, b) return a:GetStart() > b:GetStart() end)",
            `opciones = { threshold = ${values.threshold}, minimumToStrip = ${values.minimumToStrip}, preHead = ${values.preHead}, postTail = ${values.postTail}, crossFadeAudio = ${values.crossFadeAudio} }`,
            "hechos = 0",
            "for _, it in ipairs(clips) do",
            "  if it:RippleDeleteSilence(opciones) then hechos = hechos + 1 end",
            "end",
            'print(hechos .. " de " .. #clips .. " clips procesados")',
          ],
        },
      ];
    },
    warnings: [
      "Necesita DaVinci Resolve 21.1.2 o más nuevo. Si responde «0 de N clips procesados», tu versión o tu licencia no permite esta función.",
      "Después del respaldo, confirma que sigues en el timeline que quieres modificar antes de correr el segundo paso.",
      "Al cerrar los huecos, comprueba que las demás pistas sigan sincronizadas.",
    ],
  },
  {
    id: "borrar-clips-cortos",
    title: "Borrar los microcortes de silencio",
    summary:
      "Después de cortar los silencios a mano quedan decenas de clips diminutos. Este script encuentra en una pista todos los clips que duran menos que un umbral, los pinta para que los revises y luego los borra de una sola vez.",
    tags: ["Audio", "Cortes", "Limpieza"],
    params: [
      {
        key: "trackType",
        label: "Tipo de pista",
        type: "select",
        default: "audio",
        options: [
          ["audio", "Audio"],
          ["video", "Video"],
        ],
      },
      { key: "trackIndex", label: "Número de pista", type: "number", default: 1, min: 1 },
      {
        key: "maxFrames",
        label: "Duración máxima (frames)",
        type: "number",
        default: 10,
        min: 1,
        help: "Se toman los clips que duran esto o menos.",
      },
      {
        key: "from",
        label: "Aplicar",
        type: "select",
        default: "playhead",
        options: [
          ["playhead", "Desde el playhead"],
          ["timecode", "Desde un timecode"],
          ["all", "En toda la pista"],
        ],
      },
      {
        key: "timecode",
        label: "Timecode de inicio",
        type: "text",
        default: "01:00:00:00",
        pattern: /^\d{2}:\d{2}:\d{2}[:;]\d{2}$/,
        error: "Escribe el timecode como HH:MM:SS:FF.",
        showIf: (values) => values.from === "timecode",
      },
      {
        key: "color",
        label: "Color para revisar",
        type: "select",
        default: "Pink",
        options: CLIP_COLORS,
      },
      {
        key: "ripple",
        label: "Cerrar los huecos al borrar (ripple)",
        type: "checkbox",
        default: true,
      },
    ],
    steps(values) {
      const condition =
        values.from === "all"
          ? `it:GetDuration() <= ${values.maxFrames}`
          : `it:GetStart() >= desde and it:GetDuration() <= ${values.maxFrames}`;
      return [
        {
          title: "Marcar",
          note: "Pinta los clips que cumplen la condición y dice cuántos son. Puedes repetirlo con otro umbral: despinta los de la vez anterior.",
          code: [
            "tl = resolve:GetProjectManager():GetCurrentProject():GetCurrentTimeline()",
            "for _, it in ipairs(cortos or {}) do it:ClearClipColor() end",
            ...startFrameLines(values),
            "cortos = {}",
            `for _, it in ipairs(tl:GetItemListInTrack("${values.trackType}", ${values.trackIndex})) do`,
            `  if ${condition} then`,
            "    cortos[#cortos + 1] = it",
            `    it:SetClipColor("${values.color}")`,
            "  end",
            "end",
            'print(#cortos .. " clips marcados")',
          ],
        },
        {
          title: "Borrar",
          note: "Borra exactamente los clips que marcó el paso anterior.",
          code: [`tl:DeleteClips(cortos, ${values.ripple})`],
        },
      ];
    },
    warnings: [
      "El criterio es la duración, no el silencio: un trozo con voz más corto que el umbral también cae. Revisa los clips pintados antes de borrar.",
      "Pruébalo primero en un duplicado del timeline. Con ripple, comprueba que las demás pistas sigan sincronizadas.",
      "En timelines drop-frame (29.97 o 59.94) el punto de inicio puede correrse unos frames.",
    ],
  },
];
