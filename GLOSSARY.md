# brain-mesh

An AI workspace for every employee: a personal second brain plus mounted shared brains, so agents can write and find knowledge across team boundaries.

## Workspace and mounts

**Workspace**:
A user's own git repository holding their tooling, configuration and personal brain, with shared brains mounted inside it; one per user.
_Avoid_: Vault (when meaning the whole setup), project

**Mount**:
A shared brain cloned into the workspace as its own repository and recorded in the workspace configuration.
_Avoid_: Checkout, subscription

**Mount mode**:
How a user relates to a mounted brain: `read` (never written) or `contribute` (changes proposed via PR).
_Avoid_: Access level, permission

**Core**:
The brain-mesh package: CLI, workspace and brain templates, shared skills, agents and tools, released together under one version that each workspace pins.
_Avoid_: Preset, template repo, framework

**Managed file**:
A workspace file that belongs to the core and is re-rendered on upgrade; the user changes behaviour through their own files instead.
_Avoid_: Generated file (when meaning the workspace), system file

## Brains

**Brain**:
A git repository of markdown notes with a manifest and its own rules for the knowledge it holds.
_Avoid_: Wiki, knowledge base, vault

**Personal brain**:
The one brain in a workspace that belongs to its user alone and has a single writer; it is part of the workspace's repository rather than a repository of its own.
_Avoid_: Private brain, my brain

**Shared brain**:
A brain with many writers whose content only changes through reviewed pull requests.
_Avoid_: Team brain, company brain

**Unpublished brain**:
A shared brain that exists only locally, without a remote yet; it follows shared-brain rules but is committed to directly until it is published.
_Avoid_: Draft brain, local brain

**Manifest**:
The file in every brain that states its id, type, scope, owner and policies; the registry and lookup routing read it.
_Avoid_: Config, metadata file

**Registry**:
The list of shared brains that can be discovered and mounted by id.
_Avoid_: Catalogue, directory

## Notes and structure

**Knowledge note**:
A note of type note, decision, howto or person; it lives in exactly one area or in the general notes folder.
_Avoid_: Page, document, article

**Area**:
A folder for an ongoing responsibility or sub-team topic, holding all its knowledge notes and an area README.
_Avoid_: Section, category, space

**MOC**:
A map of content: a note whose job is to lead to other notes, made of a curated part and a generated list. Its kinds are the root index, area README, general notes README, map and project note.
_Avoid_: Index page, hub, table of contents

**Map**:
A MOC for a topic that cuts across areas; notes join it by naming it in their frontmatter.
_Avoid_: Topic page, tag

**Project note**:
A MOC for one finite piece of work, deleted once its durable knowledge has moved into areas.
_Avoid_: Project page, epic

## People and roles

**Owner**:
Whoever is accountable for a brain or area being true: a team for shared brains and areas, the user for a personal brain. Not the author.
_Avoid_: Author, editor, admin

**Contributor**:
Someone with push rights on a shared brain's repository, who may propose changes to it.
_Avoid_: Editor, writer

**Maintainer**:
Someone with the maintain or admin role on a brain's repository, which is the right needed to register it.
_Avoid_: Editor, admin
