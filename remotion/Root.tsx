import React from "react";
import { Composition, Folder, type CalculateMetadataFunction } from "remotion";
import { RATIOS, parseDocSpec, type Ratio } from "../lib/spec/schema";
import { buildTimeline } from "../lib/spec/timeline";
import { SAMPLES } from "../lib/samples";
import { DocFromSpec, type DocProps } from "./DocFromSpec";
import { getLayout } from "./layout";

const ratioId = (ratio: Ratio) => ratio.replace(":", "x");

/** Validates incoming props (applying defaults) and sizes the video to the spec. */
const calculateMetadata: CalculateMetadataFunction<DocProps> = ({ props }) => {
  const spec = parseDocSpec(props.spec);
  const timeline = buildTimeline(spec);
  return { durationInFrames: timeline.durationInFrames, fps: timeline.fps, props: { ...props, spec } };
};

/**
 * Compositions:
 *  - Doc-<ratio>            generic: render any DocSpec by passing { spec, ratio } as input props
 *  - <sample>-<ratio>       built-in sample documentaries
 */
export const RemotionRoot: React.FC = () => (
  <>
    {RATIOS.map((ratio) => {
      const { width, height } = getLayout(ratio);
      return (
        <Composition
          key={ratio}
          id={`Doc-${ratioId(ratio)}`}
          component={DocFromSpec}
          width={width}
          height={height}
          fps={30}
          durationInFrames={300}
          defaultProps={{ spec: SAMPLES[0].spec, ratio } satisfies DocProps}
          calculateMetadata={calculateMetadata}
        />
      );
    })}
    {SAMPLES.map((sample) => (
      <Folder key={sample.id} name={sample.id}>
        {RATIOS.map((ratio) => {
          const { width, height } = getLayout(ratio);
          return (
            <Composition
              key={ratio}
              id={`${sample.id}-${ratioId(ratio)}`}
              component={DocFromSpec}
              width={width}
              height={height}
              fps={30}
              durationInFrames={300}
              defaultProps={{ spec: sample.spec, ratio } satisfies DocProps}
              calculateMetadata={calculateMetadata}
            />
          );
        })}
      </Folder>
    ))}
  </>
);
