import type { WorkspaceModel } from '../workspace/load.js';
import { frontmatterChecks } from './checks/frontmatter.js';
import { structureChecks } from './checks/structure.js';
import { workspaceChecks } from './checks/workspace.js';
import { sortFindings, type Finding } from './finding.js';

export type CheckFn = (ws: WorkspaceModel) => Finding[];

const CHECK_FNS: readonly CheckFn[] = [workspaceChecks, structureChecks, frontmatterChecks];

/** Runs every check and sorts the findings; with `brain`, keeps only that brain's findings. */
export function runChecks(ws: WorkspaceModel, brain?: string): Finding[] {
  const all = CHECK_FNS.flatMap((check) => check(ws));
  return sortFindings(brain === undefined ? all : all.filter((f) => f.brain === brain));
}
