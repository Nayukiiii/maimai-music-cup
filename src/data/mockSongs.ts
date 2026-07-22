import { Chart, Difficulty, Song } from "../types";
import { assetOverrides } from "./assetOverrides";

const categories = ["原创", "流行&动漫", "niconico", "东方Project", "游戏&综艺", "舞萌经典"];
const versions = ["maimai DX", "Splash", "UNiVERSE", "FESTiVAL", "BUDDiES", "PRiSM"];
const designers = ["譜面-100号", "Emerald Drive", "Jackalope", "Techno Kitchen", "Moonlit Lab", "Neon Runner"];
const jacketPalettes = [
  ["#00f5d4", "#7b2ff7", "#fff44f"],
  ["#ff3cac", "#2b86c5", "#00ff87"],
  ["#ffe156", "#ff4ecd", "#1bffff"],
  ["#40c9ff", "#e81cff", "#f9f871"],
  ["#a3ff12", "#12d8fa", "#f538ff"],
  ["#ffea00", "#ff006e", "#00bbf9"]
];

const titles = [
  "Circuit Parade",
  "Neon Kanzashi",
  "Pixel Promise",
  "Wonder Dial",
  "Starlit Dealer",
  "Splash Override",
  "Prism Reactor",
  "Skyline Courier",
  "Velvet Voltage",
  "Azure Orbit",
  "Mikan Trigger",
  "Luminous Jailbreak",
  "Metro Candy",
  "Finale Signal",
  "Cosmic Shaker",
  "Hibana Loop",
  "Lucky Spinner",
  "Rave Aquarium",
  "Chrome Blossom",
  "Moon Base Bistro",
  "Kira Kira Circuit",
  "Festival Clockwork",
  "Gamma Popcorn",
  "Breeze Runner",
  "Cyber Tsukuyomi",
  "Pocket Galaxy",
  "Mirage Arcade",
  "Hyper Lantern",
  "Future Matcha",
  "Volt Atelier",
  "Sparkling Nexus",
  "Turbo Teatime",
  "Binary Sakura",
  "Garnet Comet",
  "Tropical Debug",
  "Beat Nebula",
  "Plastic Mermaid",
  "Ultra Ribbon",
  "Sunset Terminal",
  "Magic Trace",
  "Dazzle Factory",
  "Roulette Memoir",
  "Polar Beatline",
  "Aurora Upload",
  "Quantum Picnic",
  "Planet Soda",
  "Crystal Ceremony",
  "Candy Overheat",
  "Phantom Slider",
  "Yellow Breakpoint",
  "Mosaic Fireworks",
  "Signal Bouquet",
  "Nightfall Compass",
  "Rainbow Token",
  "Twin Star Debugger",
  "Encore Protocol"
];

export const mockSongs: Song[] = titles.map((title, index) => {
  const id = `mock-${String(index + 1).padStart(3, "0")}`;
  const category = categories[index % categories.length];
  const version = versions[(index + Math.floor(index / 7)) % versions.length];
  const palette = jacketPalettes[index % jacketPalettes.length];
  const assets = assetOverrides[id];

  return {
    id,
    title,
    artist: `${["Maimai Unit", "DX Factory", "Arcade Crew", "Signal Atelier"][index % 4]} ${index + 1}`,
    category,
    version,
    jacket: assets?.jacket ?? makeJacket(title, palette, index),
    previewAudio: assets?.previewAudio,
    bpm: 132 + ((index * 7) % 92),
    charts: makeCharts(index)
  };
});

function makeCharts(index: number): Chart[] {
  const master = 12.2 + ((index * 0.17) % 2.8);
  const remaster = 13.4 + ((index * 0.13) % 2.1);

  return [
    chart("Basic", 2 + (index % 3), 2.0 + (index % 18) / 10, index),
    chart("Advanced", 6 + (index % 3), 6.2 + (index % 14) / 10, index + 1),
    chart("Expert", 10 + (index % 3), 10.0 + (index % 18) / 10, index + 2),
    chart("Master", 12 + (index % 4), master, index + 3),
    chart("Re:Master", 13 + (index % 3), Math.min(remaster, 15.0), index + 4)
  ];
}

function chart(difficulty: Difficulty, levelBase: number, constant: number, designerIndex: number): Chart {
  const level = constant >= 14.7 ? "14+" : constant >= 13.7 ? "13+" : String(levelBase);
  return {
    difficulty,
    level,
    constant: Number(constant.toFixed(1)),
    designer: designers[designerIndex % designers.length]
  };
}

function makeJacket(title: string, palette: string[], index: number) {
  const shortTitle = title.split(" ").slice(0, 2).join(" ");
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="420" height="420" viewBox="0 0 420 420">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${palette[0]}"/>
          <stop offset="48%" stop-color="${palette[1]}"/>
          <stop offset="100%" stop-color="#05070d"/>
        </linearGradient>
        <pattern id="grid" width="42" height="42" patternUnits="userSpaceOnUse">
          <path d="M 42 0 L 0 0 0 42" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="2"/>
        </pattern>
      </defs>
      <rect width="420" height="420" rx="28" fill="url(#bg)"/>
      <rect width="420" height="420" fill="url(#grid)" opacity="0.55"/>
      <circle cx="${110 + (index % 5) * 42}" cy="${116 + (index % 4) * 28}" r="84" fill="none" stroke="${palette[2]}" stroke-width="18" opacity="0.85"/>
      <path d="M38 306 C120 240 180 378 278 290 S374 260 398 312" fill="none" stroke="${palette[2]}" stroke-width="14" stroke-linecap="round"/>
      <rect x="36" y="36" width="348" height="348" rx="18" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="4"/>
      <text x="42" y="256" font-family="Verdana,Arial,sans-serif" font-size="42" font-weight="900" fill="#fff" paint-order="stroke" stroke="#05070d" stroke-width="8">${escapeXml(shortTitle)}</text>
      <text x="42" y="314" font-family="Verdana,Arial,sans-serif" font-size="24" font-weight="700" fill="#fff">MAIMAI MOCK ${String(index + 1).padStart(2, "0")}</text>
    </svg>`;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function escapeXml(input: string) {
  return input.replace(/[<>&'"]/g, (char) => {
    const entities: Record<string, string> = {
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      "'": "&apos;",
      '"': "&quot;"
    };
    return entities[char];
  });
}
