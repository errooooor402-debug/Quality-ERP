export const DEFECT_CATEGORIES = {
  Man: [
    'Open STC', 'Joint STC', 'Raw STC', 'Slanted/Poor Shape', 'Needle Mark', 'Down STC',
    'Bartack/Process Mis', 'Lbl/Size mist.', 'Yarn Pull', 'Down Migration', 'Sticky Mark',
    'Crash Mark', 'Less Down', 'Damage', 'Insecure STC', 'Bartack Missing', 'Misplace',
    'Dirty Spot', 'Over STC', 'In Complete STC', 'Number Mistake', 'Uneven STC', 'Lob Show', 'Broken STC'
  ],
  Machine: [
    'Pleat', 'Skip STC', 'Missing STC', 'Shining Mark', 'Peel off', 'SPI', 'Oil Spot', 'Tens. Los/Tight'
  ],
  'Method/Technical': [
    'Gathering', 'Raw Edge', 'Up Down', 'Puckering', 'Zipper Wavy'
  ],
  Material: [
    'Shading', 'Fabric Fault', 'Foreign Yarn'
  ],
  'Non sewing': [
    'Reverse', 'Smiling', 'Loseness'
  ],
  Thread: [
    'Uncut Thread'
  ]
};

export const SEWING_DEFECTS = Array.from(new Set(Object.values(DEFECT_CATEGORIES).flat()));

export const CUTTING_DEFECTS = Array.from(new Set([
  "Crease Mark", "Shade Bar", "Needle Mark", "Shading", "Oil Spot", "Fabric Joint", "Dirty Spot", "Hole", "Knot", "Thick Yarn", "Missing Yarn", "Slub", "Color Yarn", "Damage", "End Out", "Line Mark", "Dyeing Spot"
]));

export const HOUR_SLOTS = [
  "8–9", "9–10", "10–11", "11–12", "12–1", "1–2", "2–3", "3–4", "4–5", "5–6", "6–7", "7–8", "8–9 (N)", "9–10 (N)", "10–11 (N)", "11–12 (N)"
];

export const FLOORS = [
  "Modhumoti Floor",
  "Ichamoti Floor"
];

export const LINES = [
  ...Array.from({ length: 7 }, (_, i) => `Mdmt-${i + 1}`),
  ...Array.from({ length: 7 }, (_, i) => `Icmt-${i + 1}`)
];
