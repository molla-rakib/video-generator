import React from "react";
import { Composition, registerRoot } from "remotion";
import { createTimeline } from "@studio/timeline";
import { compositionMetadata, Documentary, type DocumentaryProps } from "./composition";

/** Entry point bundled by the worker for server-side rendering. */
const defaultProps: DocumentaryProps = {
  timeline: createTimeline({ fps: 30, width: 1920, height: 1080 }),
  media: {},
  fps: 30,
};

const Root: React.FC = () => (
  <Composition
    id="Documentary"
    component={Documentary}
    defaultProps={defaultProps}
    durationInFrames={30}
    fps={30}
    width={1920}
    height={1080}
    calculateMetadata={({ props }) => compositionMetadata(props)}
  />
);

registerRoot(Root);
