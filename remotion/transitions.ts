import React from "react";
import { AbsoluteFill, interpolate } from "remotion";
import type { TransitionPresentation, TransitionPresentationComponentProps } from "@remotion/transitions";

type NoProps = Record<string, never>;

/** Classic documentary "dip to black": outgoing scene fades out, then the next fades in. */
const DipToBlack: React.FC<TransitionPresentationComponentProps<NoProps>> = ({
  children,
  presentationDirection,
  presentationProgress,
}) => {
  const opacity =
    presentationDirection === "exiting"
      ? interpolate(presentationProgress, [0, 0.5], [1, 0], { extrapolateRight: "clamp" })
      : interpolate(presentationProgress, [0.5, 1], [0, 1], { extrapolateLeft: "clamp" });
  return React.createElement(AbsoluteFill, { style: { opacity } }, children);
};

export const dipToBlack = (): TransitionPresentation<NoProps> => ({
  component: DipToBlack,
  props: {},
});
