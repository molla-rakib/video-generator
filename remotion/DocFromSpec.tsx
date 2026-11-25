import React, { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import type { AnimationVisual } from "../lib/spec/animation";
import type { DocSpec, MediaItem, Ratio } from "../lib/spec/schema";
import { AnimatedScene } from "./anim/AnimatedScene";
import { buildTimeline, type Segment } from "../lib/spec/timeline";
import { getLayout, type RatioLayout } from "./layout";
import { getTheme, gradeFilter, type Theme } from "./theme";
import { mediaMap } from "./media";
import { dipToBlack } from "./transitions";
import { KenBurnsPhoto } from "./components/KenBurnsPhoto";
import { Captions } from "./components/Captions";
import { Overlays } from "./components/Overlays";
import { ChapterCard, EndCard, OpeningCard, QuoteCard, StatCard } from "./components/Cards";
import { FilmGrain, IllustrationLabel, Vignette } from "./components/Looks";

export type DocProps = {
  spec: DocSpec;
  ratio: Ratio;
};

type Ctx = {
  spec: DocSpec;
  layout: RatioLayout;
  theme: Theme;
  media: Map<string, MediaItem>;
  filter?: string;
  captionStyle: "documentary-clean" | "bold-social";
};

const SceneView: React.FC<{ seg: Extract<Segment, { kind: "scene" }>; ctx: Ctx }> = ({ seg, ctx }) => {
  const { scene } = seg;
  const { layout, theme, media, filter } = ctx;
  const frame = useCurrentFrame();
  const v = scene.visual;
  const item = "mediaId" in v && v.mediaId ? media.get(v.mediaId) : undefined;

  const captionsOn = ctx.spec.captions.enabled && scene.narration.trim().length > 0;
  const captionSpace = captionsOn ? layout.captionBottom + (ctx.captionStyle === "bold-social" ? 200 : 110) : layout.safe.bottom;
  const outFrames = Math.round(seg.transition.durationSec * ctx.spec.meta.fps);

  let visual: React.ReactNode = null;
  if (v.type === "animation") {
    visual = (
      <AnimatedScene
        visual={v}
        cast={ctx.spec.cast}
        ratio={layout.ratio}
        art={ctx.spec.style.art}
        theme={theme}
        t={(frame - seg.visibleStart) / ctx.spec.meta.fps}
        duration={(seg.durationInFrames - seg.visibleStart - outFrames) / ctx.spec.meta.fps}
      />
    );
  } else if (v.type === "photo" && item) {
    visual = (
      <KenBurnsPhoto
        media={item}
        motion={v.motion}
        focus={v.focus}
        subject={v.subject}
        fit={v.fit}
        durationInFrames={seg.durationInFrames}
        filter={filter}
      />
    );
  } else if (v.type === "quote") {
    visual = (
      <QuoteCard
        text={v.text}
        attribution={v.attribution}
        media={item}
        theme={theme}
        layout={layout}
        durationInFrames={seg.durationInFrames}
        reserveBottom={captionSpace}
        filter={filter}
      />
    );
  } else if (v.type === "stat") {
    visual = (
      <StatCard
        value={v.value}
        decimals={v.decimals}
        prefix={v.prefix}
        suffix={v.suffix}
        label={v.label}
        media={item}
        theme={theme}
        layout={layout}
        durationInFrames={seg.durationInFrames}
        start={seg.narrationStart}
        reserveBottom={captionSpace}
        filter={filter}
      />
    );
  }

  return (
    <AbsoluteFill style={{ background: theme.background }}>
      {visual}
      {v.type === "photo" || (v.type === "animation" && captionsOn) ? (
        <AbsoluteFill style={{ background: `linear-gradient(to top, rgba(0,0,0,${v.type === "photo" ? 0.55 : 0.35}) 0%, transparent 30%)` }} />
      ) : null}
      {item?.aiGenerated ? (
        <IllustrationLabel top={layout.safe.top} right={layout.safe.right} fontFamily={theme.bodyFont} />
      ) : null}
      <Overlays
        overlays={scene.overlays}
        layout={layout}
        theme={theme}
        start={seg.narrationStart - 6}
        end={seg.durationInFrames - outFrames}
        captionSpace={captionSpace}
      />
      {captionsOn ? (
        <Captions
          text={scene.narration}
          start={seg.narrationStart}
          frames={seg.narrationFrames}
          layout={layout}
          theme={theme}
          style={ctx.captionStyle}
        />
      ) : null}
    </AbsoluteFill>
  );
};

/** The first cartoon scene's world (without its cast), behind the opening title. */
const OpeningBackdrop: React.FC<{ visual: AnimationVisual; ctx: Ctx; durationInFrames: number }> = ({ visual, ctx, durationInFrames }) => {
  const frame = useCurrentFrame();
  return (
    <AnimatedScene
      visual={{ ...visual, camera: { move: "push-in" } }}
      cast={ctx.spec.cast}
      ratio={ctx.layout.ratio}
      art={ctx.spec.style.art}
      theme={ctx.theme}
      t={frame / ctx.spec.meta.fps}
      duration={durationInFrames / ctx.spec.meta.fps}
      backgroundOnly
    />
  );
};

const SegmentView: React.FC<{ seg: Segment; ctx: Ctx }> = ({ seg, ctx }) => {
  const { spec, layout, theme, media, filter } = ctx;
  switch (seg.kind) {
    case "opening": {
      const firstVisual = spec.chapters.flatMap((c) => c.scenes).map((s) => s.visual)[0];
      const firstPhoto = spec.chapters
        .flatMap((c) => c.scenes)
        .map((s) => s.visual)
        .find((v) => v.type === "photo");
      return (
        <OpeningCard
          title={spec.meta.title}
          subtitle={spec.meta.subtitle}
          media={firstVisual?.type === "animation" || !firstPhoto ? undefined : media.get(firstPhoto.mediaId)}
          backdrop={
            firstVisual?.type === "animation" ? (
              <OpeningBackdrop visual={firstVisual} ctx={ctx} durationInFrames={seg.durationInFrames} />
            ) : undefined
          }
          theme={theme}
          layout={layout}
          durationInFrames={seg.durationInFrames}
          filter={filter}
        />
      );
    }
    case "chapter-card":
      return <ChapterCard index={seg.chapterIndex} title={seg.chapter.title} theme={theme} layout={layout} />;
    case "scene":
      return <SceneView seg={seg} ctx={ctx} />;
    case "end-card":
      return (
        <EndCard
          title={spec.meta.title}
          sources={spec.endCard.showSources ? spec.sources.map((s) => ({ primary: `${s.publisher} — ${s.title}`, secondary: s.url })) : []}
          credits={
            spec.endCard.showCredits
              ? [
                  ...(spec.chapters.some((c) => c.scenes.some((s) => s.visual.type === "animation"))
                    ? [{ primary: "Animation", secondary: "Animated reconstruction: characters, dialogue staging and scenes are artistic interpretations of the events." }]
                    : []),
                  ...spec.media.map((m) => ({
                    primary: m.title,
                    secondary: `${m.aiGenerated ? "AI illustration · " : ""}${m.attribution}`,
                  })),
                ]
              : []
          }
          theme={theme}
          layout={layout}
          durationInFrames={seg.durationInFrames}
        />
      );
  }
};

/** Renders a full documentary from a DocSpec, in any of the four aspect ratios. */
export const DocFromSpec: React.FC<DocProps> = ({ spec, ratio }) => {
  const timeline = useMemo(() => buildTimeline(spec), [spec]);
  const layout = getLayout(ratio);
  const theme = getTheme(spec.style);
  const ctx: Ctx = useMemo(
    () => ({
      spec,
      layout,
      theme,
      media: mediaMap(spec),
      filter: gradeFilter(spec.style.grade),
      captionStyle: spec.captions.style === "auto" ? layout.captionStyle : spec.captions.style,
    }),
    [spec, layout, theme],
  );

  const children: React.ReactNode[] = [];
  timeline.segments.forEach((seg, i) => {
    children.push(
      <TransitionSeries.Sequence key={seg.key} durationInFrames={seg.durationInFrames}>
        <SegmentView seg={seg} ctx={ctx} />
      </TransitionSeries.Sequence>,
    );
    const isLast = i === timeline.segments.length - 1;
    if (!isLast && seg.transition.type !== "cut") {
      const timing = linearTiming({ durationInFrames: Math.round(seg.transition.durationSec * timeline.fps) });
      children.push(
        seg.transition.type === "dip-to-black" ? (
          <TransitionSeries.Transition key={`${seg.key}-t`} timing={timing} presentation={dipToBlack()} />
        ) : (
          <TransitionSeries.Transition key={`${seg.key}-t`} timing={timing} presentation={fade()} />
        ),
      );
    }
  });

  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <TransitionSeries>{children}</TransitionSeries>
      {spec.style.grade === "archival" || spec.style.grain ? <Vignette strength={spec.style.grade === "archival" ? 0.6 : 0.4} /> : null}
      {spec.style.grain ? <FilmGrain opacity={spec.style.grade === "archival" ? 0.12 : 0.07} /> : null}
    </AbsoluteFill>
  );
};
