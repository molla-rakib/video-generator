import type { DocSpecInput } from "../spec/schema";

/**
 * Hand-written reference animation in the exact format Claude produces.
 * Facts verified against the listed sources (NPS, Smithsonian, Wikipedia).
 */
export const firstFlight: DocSpecInput = {
  version: 1,
  meta: { title: "Twelve Seconds", subtitle: "How two bicycle makers taught the world to fly", language: "en", fps: 30 },
  style: { preset: "cartoon", art: "storybook" },
  cast: [
    {
      id: "wilbur",
      name: "Wilbur Wright",
      look: { skin: "light", hairStyle: "bald", hairColor: "#5a4632", outfit: "suit", topColor: "#3d4b5c", bottomColor: "#2c333d", build: "slim", height: 1.06 },
    },
    {
      id: "orville",
      name: "Orville Wright",
      look: { skin: "light", hairStyle: "side-part", hairColor: "#4a3426", outfit: "suit", topColor: "#7a6450", bottomColor: "#3b3027", hat: "flat-cap", facialHair: "mustache" },
    },
  ],
  chapters: [
    {
      id: "dayton",
      title: "Two Brothers from Dayton",
      scenes: [
        {
          id: "s1",
          narration: "Wilbur and Orville Wright made their living building bicycles in Dayton, Ohio. Their real obsession was flight.",
          durationSec: 9,
          claims: [{ text: "The brothers ran a bicycle business in Dayton, Ohio", sourceIds: ["wiki-wright"], status: "verified" }],
          visual: {
            type: "animation",
            background: { scene: "workshop", time: "day" },
            camera: { move: "push-in" },
            elements: [
              { type: "prop", id: "bike", prop: "bicycle", x: 0.5, scale: 0.9 },
              { type: "character", id: "w", castId: "wilbur", x: 0.26, facing: "right", actions: [{ at: 5.2, do: "think", expression: "thinking" }, { at: 7.4, do: "nod", expression: "happy" }] },
              {
                type: "character",
                id: "o",
                castId: "orville",
                x: 0.74,
                facing: "left",
                actions: [{ at: 0.2, do: "enter", from: "right", x: 0.74 }, { at: 3, do: "talk", duration: 2.2, expression: "excited" }, { at: 6.6, do: "point" }],
              },
              { type: "speech", characterId: "o", text: "What if a machine could fly?", at: 3, duration: 2.6 },
              { type: "speech", characterId: "w", text: "Then let's build one.", at: 6.2, duration: 2.4 },
              { type: "text", text: "Dayton, Ohio", style: "label", x: 0.5, y: 0.14, at: 0.4, duration: 3.6 },
            ],
          },
        },
        {
          id: "s2",
          narration: "Working with kites and gliders, they studied how a pilot could balance and steer a machine in the air.",
          durationSec: 9,
          claims: [{ text: "They developed their control ideas with kites and gliders", sourceIds: ["wiki-wright"], status: "verified" }],
          visual: {
            type: "animation",
            background: { scene: "meadow", time: "day" },
            elements: [
              {
                type: "timeline",
                y: 0.3,
                at: 0.6,
                step: 1.2,
                events: [
                  { label: "1899", caption: "Kite tests" },
                  { label: "1900", caption: "First glider" },
                  { label: "1902", caption: "Better glider" },
                  { label: "1903", caption: "The Flyer" },
                ],
              },
              { type: "character", id: "w", castId: "wilbur", x: 0.18, facing: "right", actions: [{ at: 1, do: "look-up" }, { at: 4.5, do: "point", duration: 2.5 }] },
              { type: "character", id: "o", castId: "orville", x: 0.82, facing: "left", actions: [{ at: 2, do: "think", expression: "thinking" }, { at: 6.2, do: "nod", expression: "happy" }] },
              { type: "effect", effect: "sparkles", at: 5.6, duration: 2, intensity: 0.6 },
            ],
          },
        },
      ],
    },
    {
      id: "kitty-hawk",
      title: "December 17, 1903",
      scenes: [
        {
          id: "s3",
          narration:
            "At 10:35 in the morning at Kill Devil Hills, North Carolina, Orville released the restraining wire, and the Flyer moved down its rail into a twenty-seven mile-per-hour wind.",
          durationSec: 12,
          claims: [
            { text: "Orville released the restraining wire at 10:35", sourceIds: ["nps-first-flight"], status: "verified" },
            { text: "The Flyer took off into a 27-mph wind", sourceIds: ["nps-first-flight"], status: "verified" },
          ],
          visual: {
            type: "animation",
            background: { scene: "dunes", time: "day" },
            camera: { move: "follow", target: "flyer" },
            elements: [
              { type: "text", text: "1903", style: "year", x: 0.5, y: 0.2, at: 0.3, duration: 3 },
              { type: "prop", id: "flyer", prop: "biplane", x: 0.28, y: 1, scale: 0.85, actions: [{ at: 4.5, do: "move-to", x: 0.62, y: 0.78, duration: 6 }] },
              {
                type: "character",
                id: "w",
                castId: "wilbur",
                x: 0.12,
                facing: "right",
                actions: [{ at: 4.6, do: "run-to", x: 0.55, duration: 5.4 }, { at: 10, do: "cheer", expression: "excited" }],
              },
              { type: "speech", characterId: "w", text: "It's flying!", at: 8.8, duration: 2.6, kind: "shout" },
              { type: "effect", effect: "dust", at: 4.5, duration: 4, intensity: 0.8 },
            ],
          },
        },
        {
          id: "s4",
          narration: "That first flight lasted just twelve seconds, and covered about one hundred and twenty feet.",
          durationSec: 8,
          claims: [{ text: "The first flight lasted 12 seconds and covered 120 feet", sourceIds: ["wiki-flyer", "nps-first-flight"], status: "verified" }],
          visual: {
            type: "animation",
            background: { scene: "dunes", time: "day" },
            elements: [
              { type: "counter", value: 12, suffix: " seconds", label: "The first powered, controlled airplane flight", x: 0.5, y: 0.3, at: 0.4 },
              { type: "prop", id: "flyer", prop: "biplane", x: 0.5, y: 0.75, scale: 0.6, actions: [{ at: 0, do: "fly-across", to: "right", y: 0.72, duration: 7 }] },
            ],
          },
        },
        {
          id: "s5",
          narration: "By the fourth flight of the day, Wilbur stayed aloft for fifty-nine seconds, and eight hundred and fifty-two feet.",
          durationSec: 9,
          claims: [{ text: "The fourth flight covered 852 feet in 59 seconds", sourceIds: ["nps-first-flight"], status: "verified" }],
          visual: {
            type: "animation",
            background: { scene: "dunes", time: "sunset" },
            camera: { move: "pan-right" },
            elements: [
              { type: "prop", id: "flyer", prop: "biplane", x: 0.5, y: 0.5, scale: 0.55, actions: [{ at: 0.3, do: "fly-across", to: "right", y: 0.48, duration: 7.5 }] },
              { type: "text", text: "852 feet · 59 seconds", style: "label", x: 0.5, y: 0.16, at: 2.2 },
              { type: "character", id: "o", castId: "orville", x: 0.34, facing: "right", actions: [{ at: 1.2, do: "look-up" }, { at: 4.5, do: "cheer", duration: 3, expression: "excited" }] },
              { type: "speech", characterId: "o", text: "Fifty-nine seconds, Will!", at: 5, duration: 2.6, kind: "shout" },
              { type: "effect", effect: "confetti", at: 4.6, duration: 3.5 },
            ],
          },
        },
      ],
    },
    {
      id: "legacy",
      title: "The Age of Flight",
      scenes: [
        {
          id: "s6",
          narration: "Today the Smithsonian preserves the original 1903 Flyer: the machine that launched the age of flight.",
          durationSec: 9,
          claims: [{ text: "The original 1903 Wright Flyer is in the Smithsonian collection", sourceIds: ["nasm-flyer"], status: "verified" }],
          visual: {
            type: "animation",
            background: { scene: "city", time: "day" },
            camera: { move: "pull-out" },
            elements: [
              { type: "prop", id: "jet", prop: "airplane", x: 0.5, y: 0.32, scale: 0.7, actions: [{ at: 1.2, do: "fly-across", to: "left", y: 0.3, duration: 6 }] },
              { type: "character", id: "w", castId: "wilbur", x: 0.38, facing: "right", expression: "happy", actions: [{ at: 2.5, do: "look-up" }, { at: 5.2, do: "wave" }] },
              { type: "character", id: "o", castId: "orville", x: 0.62, facing: "left", expression: "happy", actions: [{ at: 2.8, do: "look-up" }, { at: 5.6, do: "wave" }] },
            ],
          },
        },
      ],
    },
  ],
  sources: [
    { id: "nps-first-flight", url: "https://www.nps.gov/wrbr/learn/historyculture/thefirstflight.htm", title: "The First Flight", publisher: "National Park Service" },
    {
      id: "nasm-flyer",
      url: "https://airandspace.si.edu/collection-objects/1903-wright-flyer/nasm_A19610048000",
      title: "1903 Wright Flyer",
      publisher: "Smithsonian National Air and Space Museum",
    },
    { id: "wiki-flyer", url: "https://en.wikipedia.org/wiki/Wright_Flyer", title: "Wright Flyer", publisher: "Wikipedia" },
    { id: "wiki-wright", url: "https://en.wikipedia.org/wiki/Wright_brothers", title: "Wright brothers", publisher: "Wikipedia" },
  ],
};
