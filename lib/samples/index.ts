import { parseDocSpec, type DocSpec } from "../spec/schema";
import { firstFlight } from "./firstFlight";
import { moonLanding } from "./moonLanding";

export type Sample = { id: string; label: string; prompt: string; spec: DocSpec };

export const SAMPLES: Sample[] = [
  {
    id: "moon-landing",
    label: "One Giant Leap",
    prompt: "A short animated documentary about the Apollo 11 Moon landing",
    spec: parseDocSpec(moonLanding),
  },
  {
    id: "first-flight",
    label: "Twelve Seconds",
    prompt: "The Wright brothers and the first powered flight, as a storybook cartoon",
    spec: parseDocSpec(firstFlight),
  },
];
