/** A repository on the host. */
export interface RepoRef {
  owner: string;
  name: string;
}

/** The authenticated user's access to a repo, highest role first. */
export type Permission = 'admin' | 'maintain' | 'write' | 'triage' | 'read' | 'none';

/** Whether an owner exists and has write access; 'unknown' when the host would not say (e.g. 403). */
export type OwnerStatus = 'ok' | 'not-found' | 'no-write' | 'unknown';

export interface PullRequestInput {
  repo: RepoRef;
  head: string;
  base: string;
  title: string;
  body: string;
}

/**
 * The git host, seen from brain-mesh (spec 9.4). Network methods throw CliError `E_OFFLINE`,
 * `E_GH_MISSING`, `E_GH_AUTH` or `E_HOST` when the host cannot be asked.
 */
export interface Host {
  /** Login of the authenticated user. */
  login(): Promise<string>;
  /** Creates an empty private repo in the user's own namespace and returns its clone URL. Throws `E_REPO_CREATE`. */
  createPrivateRepo(name: string): Promise<string>;
  /** The repo a clone URL names on this host; null when the URL is not on this host. */
  repoOf(url: string): RepoRef | null;
  /** The authenticated user's access to `repo`; 'none' when the host answers 404. */
  permission(repo: RepoRef): Promise<Permission>;
  /** Whether `owner` ("@login" or "@org/team") exists and has write access to `repo`. */
  ownerStatus(owner: string, repo: RepoRef): Promise<OwnerStatus>;
  /** Opens a pull request. Throws `E_PR_CREATE` with the host's reason (e.g. one already exists for `head`). */
  createPullRequest(pr: PullRequestInput): Promise<{ number: number; url: string }>;
}
