import type { DocSpecInput } from "../spec/schema";

/**
 * Hand-written reference animation in the exact format Claude produces.
 * Facts verified against the listed sources (NASA, Wikipedia).
 */
const astronaut = (hairColor: string, skin: "light" | "fair" = "light") =>
  ({ skin, hairStyle: "short", hairColor, outfit: "astronaut", topColor: "#f1f3f6", bottomColor: "#e6e9ee", hat: "helmet" }) as const;

export const moonLanding: DocSpecInput = {
  version: 1,
  meta: { title: "One Giant Leap", subtitle: "The eight days of Apollo 11", language: "en", fps: 30 },
  style: { preset: "cartoon", art: "bold" },
  cast: [
    { id: "neil", name: "Neil Armstrong", look: astronaut("#b88a4a") },
    { id: "mike", name: "Michael Collins", look: astronaut("#3b2b22", "fair") },
    { id: "buzz", name: "Buzz Aldrin", look: astronaut("#8a8f96", "fair") },
  ],
  chapters: [
    {
      id: "liftoff",
      title: "Liftoff",
      scenes: [
        {
          id: "m1",
          narration: "On July 16, 1969, a Saturn V rocket lifted off from Kennedy Space Center in Florida, carrying three men toward the Moon.",
          durationSec: 10,
          claims: [
            { text: "Apollo 11 launched on July 16, 1969", sourceIds: ["nasa-a11"], status: "verified" },
            { text: "It lifted off from Kennedy Space Center in Florida", sourceIds: ["nasa-a11"], status: "verified" },
          ],
          visual: {
            type: "animation",
            background: { scene: "beach", time: "day" },
            elements: [
              { type: "prop", id: "rocket", prop: "rocket", x: 0.5, y: 1, scale: 1.25, actions: [{ at: 3.2, do: "launch", duration: 5.5 }] },
              { type: "text", text: "July 16, 1969", style: "label", x: 0.5, y: 0.12, at: 0.3, duration: 3 },
              { type: "effect", effect: "smoke", at: 3.2, duration: 5 },
              { type: "text", text: "3… 2… 1…", style: "title", x: 0.5, y: 0.3, at: 0.6, duration: 2.4 },
            ],
          },
        },
        {
          id: "m2",
          narration: "Commander Neil Armstrong, command module pilot Michael Collins, and lunar module pilot Edwin \"Buzz\" Aldrin.",
          durationSec: 9,
          claims: [{ text: "The crew was Armstrong, Collins and Aldrin", sourceIds: ["nasa-a11"], status: "verified" }],
          visual: {
            type: "animation",
            background: { scene: "studio" },
            camera: { move: "push-in" },
            elements: [
              { type: "character", id: "n", castId: "neil", x: 0.2, facing: "right", expression: "happy", actions: [{ at: 0.6, do: "wave" }] },
              { type: "character", id: "m", castId: "mike", x: 0.5, facing: "right", expression: "happy", actions: [{ at: 3.2, do: "wave" }] },
              { type: "character", id: "b", castId: "buzz", x: 0.8, facing: "left", expression: "happy", actions: [{ at: 5.6, do: "wave" }] },
              { type: "text", text: "Armstrong", style: "label", x: 0.2, y: 0.22, at: 0.6 },
              { type: "text", text: "Collins", style: "label", x: 0.5, y: 0.22, at: 3.2 },
              { type: "text", text: "Aldrin", style: "label", x: 0.8, y: 0.22, at: 5.6 },
              { type: "effect", effect: "sparkles", at: 0, intensity: 0.5 },
            ],
          },
        },
        {
          id: "m3",
          narration: "Their destination lay, on average, three hundred and eighty-four thousand kilometres away.",
          durationSec: 8,
          claims: [{ text: "The Moon is an average of 384,400 km from Earth", sourceIds: ["nasa-moon"], status: "verified" }],
          visual: {
            type: "animation",
            background: { scene: "space" },
            elements: [
              { type: "prop", id: "earth", prop: "globe", x: 0.06, y: 0.95, scale: 0.9, actions: [{ at: 0, do: "float" }] },
              { type: "prop", id: "ship", prop: "satellite", x: 0.3, y: 0.7, scale: 0.4, actions: [{ at: 0.2, do: "move-to", x: 0.85, y: 0.62, duration: 7 }] },
              { type: "counter", value: 384400, suffix: " km", label: "Average distance from Earth to the Moon", x: 0.5, y: 0.3, at: 0.6 },
            ],
          },
        },
      ],
    },
    {
      id: "tranquility",
      title: "Tranquility Base",
      scenes: [
        {
          id: "m4",
          narration: "On July 20, the lunar module Eagle touched down in the Sea of Tranquility.",
          durationSec: 8,
          claims: [
            { text: "The lunar module landed on July 20, 1969", sourceIds: ["nasa-a11"], status: "verified" },
            { text: "It landed in the Sea of Tranquility", sourceIds: ["wiki-a11"], status: "verified" },
          ],
          visual: {
            type: "animation",
            background: { scene: "moon" },
            camera: { move: "push-in", target: "eagle" },
            elements: [
              { type: "prop", id: "eagle", prop: "lander", x: 0.42, y: 0.25, scale: 1, actions: [{ at: 0, do: "move-to", x: 0.42, y: 1, duration: 4.5 }] },
              { type: "effect", effect: "dust", at: 3.6, duration: 2.6, intensity: 1.4 },
              { type: "text", text: "Sea of Tranquility", style: "label", x: 0.5, y: 0.12, at: 4.8 },
            ],
          },
        },
        {
          id: "m5",
          narration: "Hours later, Neil Armstrong became the first person to set foot on the Moon.",
          durationSec: 9,
          claims: [{ text: "Armstrong was the first person to walk on the Moon", sourceIds: ["nasa-a11", "wiki-a11"], status: "verified" }],
          visual: {
            type: "animation",
            background: { scene: "moon" },
            camera: { move: "follow", target: "n" },
            elements: [
              { type: "prop", id: "eagle", prop: "lander", x: 0.3, scale: 1 },
              { type: "character", id: "n", castId: "neil", x: 0.32, facing: "right", hiddenUntilFirstAction: true, actions: [{ at: 0.8, do: "walk-to", x: 0.62, duration: 3.4 }, { at: 4.4, do: "jump" }] },
              { type: "speech", characterId: "n", text: "That's one small step for man, one giant leap for mankind.", at: 5, duration: 3.8 },
            ],
          },
        },
        {
          id: "m6",
          narration: "Buzz Aldrin joined him nineteen minutes later. Together they spent around two and a half hours walking on the surface.",
          durationSec: 10,
          claims: [
            { text: "Aldrin joined Armstrong nineteen minutes later", sourceIds: ["wiki-a11"], status: "verified" },
            { text: "They spent about two and a half hours on the surface", sourceIds: ["wiki-a11"], status: "verified" },
            { text: "Aldrin described the view as \"Magnificent desolation\"", sourceIds: ["wiki-a11"], status: "verified" },
          ],
          visual: {
            type: "animation",
            background: { scene: "moon" },
            elements: [
              { type: "prop", id: "eagle", prop: "lander", x: 0.16, scale: 0.9 },
              { type: "character", id: "n", castId: "neil", x: 0.7, facing: "left", actions: [{ at: 2.6, do: "wave" }, { at: 6, do: "jump" }] },
              {
                type: "character",
                id: "b",
                castId: "buzz",
                x: 0.45,
                facing: "right",
                actions: [{ at: 0.3, do: "enter", from: "left", x: 0.45, duration: 2.5 }, { at: 3, do: "wave", expression: "excited" }, { at: 6.4, do: "jump" }],
              },
              { type: "speech", characterId: "b", text: "Magnificent desolation!", at: 3.2, duration: 2.8 },
              { type: "text", text: "≈ 2½ hours outside", style: "label", x: 0.5, y: 0.12, at: 5.2 },
            ],
          },
        },
        {
          id: "m7",
          narration: "They gathered twenty-one and a half kilograms of lunar rock and soil to bring home.",
          durationSec: 8,
          claims: [{ text: "Apollo 11 returned 47.5 lb (21.5 kg) of lunar samples", sourceIds: ["wiki-a11"], status: "verified" }],
          visual: {
            type: "animation",
            background: { scene: "moon" },
            elements: [
              { type: "prop", id: "box", prop: "crate", x: 0.5, scale: 0.7, hiddenUntilFirstAction: true, actions: [{ at: 1.2, do: "pop-in" }, { at: 4, do: "pulse" }] },
              { type: "character", id: "b", castId: "buzz", x: 0.25, facing: "right", actions: [{ at: 0.4, do: "point", duration: 2 }] },
              { type: "character", id: "n", castId: "neil", x: 0.75, facing: "left", actions: [{ at: 2.5, do: "cheer", duration: 1.8, expression: "excited" }] },
              { type: "counter", value: 21.5, decimals: 1, suffix: " kg", label: "of lunar samples returned to Earth", x: 0.5, y: 0.28, at: 1.6 },
            ],
          },
        },
      ],
    },
    {
      id: "home",
      title: "Homecoming",
      scenes: [
        {
          id: "m8",
          narration: "On July 24, 1969, the crew splashed down in the Pacific Ocean, completing humanity's first journey to the surface of another world.",
          durationSec: 10,
          claims: [{ text: "Splashdown was on July 24, 1969", sourceIds: ["nasa-a11"], status: "verified" }],
          visual: {
            type: "animation",
            background: { scene: "ocean", time: "sunset" },
            camera: { move: "pull-out" },
            elements: [
              { type: "prop", id: "columbia", prop: "capsule", x: 0.62, y: 0.15, scale: 0.75, actions: [{ at: 0, do: "move-to", x: 0.62, y: 1, duration: 4.2 }] },
              { type: "text", text: "July 24, 1969", style: "label", x: 0.5, y: 0.12, at: 0.5 },
              { type: "text", text: "Welcome home!", style: "title", x: 0.5, y: 0.3, at: 4.5 },
              { type: "effect", effect: "confetti", at: 4.5, duration: 4 },
            ],
          },
        },
      ],
    },
  ],
  sources: [
    { id: "nasa-a11", url: "https://www.nasa.gov/mission/apollo-11/", title: "Apollo 11", publisher: "NASA" },
    { id: "nasa-moon", url: "https://science.nasa.gov/moon/facts/", title: "Moon Facts", publisher: "NASA Science" },
    { id: "wiki-a11", url: "https://en.wikipedia.org/wiki/Apollo_11", title: "Apollo 11", publisher: "Wikipedia" },
  ],
};
