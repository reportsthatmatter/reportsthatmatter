import type { Pass, GeometryPass, VolumePass } from "./passes";

export type Volume = { path: string; sha256?: string };

/**
 * One report's build, as a program rather than as data the pipeline
 * interprets.
 *
 * The report owns this file: it names every decision that shaped its text,
 * in one place, and an agent working on that report can read it without
 * understanding any other report's constraints. What it composes is library
 * code, so a fix to a shared pass still reaches every report that calls it.
 */
export type PipelineDef = {
  id: string;
  title: string;
  authors?: string;
  published_at?: string;
  source_url?: string;
  /** Where the source lives, relative to the site repo root. */
  repo: string;
  /**
   * Ordered, and the order is semantic: footnote numbering and page indices
   * run continuously across volumes, so reordering changes the output.
   */
  volumes: Volume[];
  /** How to read each page, and each volume. */
  passes?: Pass[];
};

export type ResolvedPasses = {
  geometry: "per-volume" | "document";
  volumePasses: VolumePass[];
};

/** Validates a report's definition. Throws rather than ingesting nonsense. */
export function pipeline(def: PipelineDef): PipelineDef {
  if (!def.id) throw new Error("pipeline has no id");
  if (!def.title) throw new Error(`${def.id}: pipeline has no title`);
  if (!def.repo) throw new Error(`${def.id}: pipeline has no repo`);
  if (!def.volumes?.length) throw new Error(`${def.id}: pipeline lists no volumes`);

  for (const volume of def.volumes) {
    if (!volume?.path) throw new Error(`${def.id}: a volume has no path`);
    if (volume.path.startsWith("/") || volume.path.split("/").includes("..")) {
      throw new Error(
        `${def.id}: volume path "${volume.path}" escapes the report repo`
      );
    }
  }

  const geometries = (def.passes ?? []).filter(
    (pass): pass is GeometryPass => pass.stage === "geometry"
  );
  if (geometries.length > 1) {
    throw new Error(`${def.id}: more than one geometry pass declared`);
  }

  return def;
}

/**
 * Reads a definition's passes into the shape the executor wants.
 *
 * A report that declares nothing gets the single-volume defaults, which is
 * what every report but Leveson had before passes existed.
 */
export function resolvePasses(def: PipelineDef): ResolvedPasses {
  const passes = def.passes ?? [];
  const geometry = passes.find(
    (pass): pass is GeometryPass => pass.stage === "geometry"
  );
  return {
    geometry: geometry?.scope ?? "document",
    volumePasses: passes.filter((pass): pass is VolumePass => pass.stage === "volume"),
  };
}
