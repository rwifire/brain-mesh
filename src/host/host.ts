/** The git host, seen from brain-mesh. Chunk 8 grows this into the full adapter (spec 9.4). */
export interface Host {
  /** Login of the authenticated user. Throws CliError `E_GH_MISSING` or `E_GH_AUTH`. */
  login(): Promise<string>;
  /** Creates an empty private repo in the user's own namespace and returns its clone URL. Throws `E_REPO_CREATE`. */
  createPrivateRepo(name: string): Promise<string>;
}
