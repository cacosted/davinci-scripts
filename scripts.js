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

export const scripts = [
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
