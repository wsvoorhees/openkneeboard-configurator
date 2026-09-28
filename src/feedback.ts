/**
 * The six touch-strip faces, in physical dial order.
 *
 * Encoder layouts do not read a profile action's `States[].Image`; their pixmap is a separate
 * feedback item. Inline SVG keeps that feedback self-contained inside the plugin; the action
 * artwork referenced by the manifest is bundled separately under imgs/.
 */
const svg = (source: string): string => `data:image/svg+xml;base64,${Buffer.from(source).toString("base64")}`;

export const PLACEMENT_FEEDBACK = [
  {
    name: "fadeIn",
    title: "Opacity",
    icon: svg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><circle cx="12" cy="12" r="5"/><path d="M11 1h2v4h-2zm0 18h2v4h-2zM1 11h4v2H1zm18 0h4v2h-4zM3.5 5l1.5-1.5 3 3L6.5 8zm13 13 1.5-1.5 3 3-1.5 1.5zM16.5 6.5l3-3L21 5l-3 3zM3.5 19.5l3-3L8 18l-3 3z"/></svg>'),
  },
  {
    name: "size",
    title: "Size",
    icon: svg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M16 17.01V10h-2v7.01h-3L15 21l4-3.99h-3zM9 3 5 6.99h3V14h2V6.99h3L9 3z"/></svg>'),
  },
  {
    name: "nearFar",
    title: "Near/Far",
    icon: svg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><polygon points="21,11 21,3 13,3 16.29,6.29 6.29,16.29 3,13 3,21 11,21 7.71,17.71 17.71,7.71"/></svg>'),
  },
  {
    name: "pitch",
    title: "Pitch",
    icon: svg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M7.34 6.41.86 12.9l6.49 6.48 6.49-6.48-6.5-6.49zM3.69 12.9l3.66-3.66L11 12.9l-3.66 3.66-3.65-3.66zm15.67-6.26C17.61 4.88 15.3 4 13 4V.76L8.76 5 13 9.24V6c1.79 0 3.58.68 4.95 2.05 2.73 2.73 2.73 7.17 0 9.9C16.58 19.32 14.79 20 13 20c-.97 0-1.94-.21-2.84-.61l-1.49 1.49C10.02 21.62 11.51 22 13 22c2.3 0 4.61-.88 6.36-2.64 3.52-3.51 3.52-9.21 0-12.72z"/></svg>'),
  },
  {
    name: "yaw",
    title: "Yaw",
    icon: svg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M12 7C6.48 7 2 9.24 2 12c0 2.24 2.94 4.13 7 4.77V20l4-4-4-4v2.73c-3.15-.56-5-1.9-5-2.73 0-1.06 3.04-3 8-3s8 1.94 8 3c0 .73-1.46 1.89-4 2.53v2.05c3.53-.77 6-2.53 6-4.58 0-2.76-4.48-5-10-5z"/></svg>'),
  },
  {
    name: "roll",
    title: "Roll",
    icon: svg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M16.48 2.52c3.27 1.55 5.61 4.72 5.97 8.48h1.5C23.44 4.84 18.29 0 12 0l-.66.03 3.81 3.81 1.33-1.32zm-6.25-.77c-.59-.59-1.54-.59-2.12 0L1.75 8.11c-.59.59-.59 1.54 0 2.12l12.02 12.02c.59.59 1.54.59 2.12 0l6.36-6.36c.59-.59.59-1.54 0-2.12L10.23 1.75zm4.6 19.44L2.81 9.17l6.36-6.36 12.02 12.02-6.36 6.36zm-7.31.29C4.25 19.94 1.91 16.76 1.55 13H.05C.56 19.16 5.71 24 12 24l.66-.03-3.81-3.81-1.33 1.32z"/></svg>'),
  },
] as const;

export function placementFeedback(index: number): (typeof PLACEMENT_FEEDBACK)[number] | undefined {
  return PLACEMENT_FEEDBACK[index];
}

const TRANSLATION_FEEDBACK = [
  {
    title: "Left/Right",
    icon: svg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="m7 4-7 8 7 8v-5h10v5l7-8-7-8v5H7V4z"/></svg>'),
  },
  {
    title: "Up/Down",
    icon: svg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="m12 0-8 7h5v10H4l8 7 8-7h-5V7h5l-8-7z"/></svg>'),
  },
];

/** The selected movement, including Size, rather than the physical dial position. */
export function placementFeedbackForAxis(index: number, size = false): { title: string; icon: string } | undefined {
  if (size) return PLACEMENT_FEEDBACK[1];
  if (index < 2) return TRANSLATION_FEEDBACK[index];
  return PLACEMENT_FEEDBACK[index];
}
