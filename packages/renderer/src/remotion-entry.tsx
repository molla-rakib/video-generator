import React from "react";
import { Composition, registerRoot } from "remotion";
import { createTimeline } from "@studio/timeline";
import { compositionMetadata, Video, type VideoProps } from "./composition";

/** Entry point bundled by the worker for server-side rendering. */
const defaultProps: VideoProps = {
  timeline: createTimeline({ fps: 30, ratio: "16:9" }),
  ratio: "16:9",
  fileBase: "",
  sceneBase: "",
  versions: {},
  fps: 30,
};

const Root: React.FC = () => (
  <Composition
    id="Video"
    component={Video}
    defaultProps={defaultProps}
    durationInFrames={30}
    fps={30}
    width={1920}
    height={1080}
    calculateMetadata={({ props }) => compositionMetadata(props)}
  />
);

registerRoot(Root);
