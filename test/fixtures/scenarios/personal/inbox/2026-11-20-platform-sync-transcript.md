# Platform sync 2026-11-20

[00:00] Anna: Okay, let's start. Three things today: runner cache, flaky tests, and the merge queue.
[00:01] Ben: Runner cache first. The 7-day layer TTL is too long. Lockfiles change every few days and we keep pulling stale layers that then get rebuilt anyway.
[00:02] Anna: What do you propose?
[00:02] Ben: Three days. I measured last week: with three days the hit rate only drops from 81 to 78 percent, and the registry storage halves.
[00:03] Carla: Fine by me.
[00:03] Anna: Then that's decided: layer TTL goes from 7 to 3 days, starting Monday. Ben changes the runner config.
[00:04] Ben: Will do.
[00:05] Anna: Flaky tests. Carla, you had a point there.
[00:05] Carla: Yes. Honestly I thought the rule was that a flaky test gets deleted after the first failure. That's what the frontend folks are doing.
[00:06] Ben: That's not what we agreed in the retro, is it?
[00:06] Anna: I'm not sure anymore. Let's check the retro notes before we argue about it.
[00:07] Carla: Okay, I'll look it up.
[00:08] Anna: Merge queue. We've talked about this for months.
[00:08] Ben: The idea: every PR to main goes through a queue that rebases and runs the full suite before merging, so main never breaks because two green PRs conflict.
[00:09] Carla: GitHub has that built in now. It batches PRs too, up to five at a time.
[00:10] Anna: Costs?
[00:10] Ben: More runner minutes, maybe ten percent. But we lose about an hour a week fixing broken main.
[00:11] Anna: Let's try it. Decision: we turn on the merge queue for main in the platform repo from 1 December, batch size three, and review after a month.
[00:12] Carla: Who owns the review?
[00:12] Anna: I do.
[00:13] Ben: One more thing, off the record. Tom has been really sloppy with reviews lately, he approves everything without reading it.
[00:13] Anna: Let's not discuss that here. I'll talk to him.
[00:14] Carla: Also, does anyone know if the cache warming job still runs at night? Nobody seems to own it.
[00:14] Ben: No idea. It might have died with the old Jenkins.
[00:15] Anna: Open question then. Let's find out who owns the cache warming job.
[00:15] Anna: That's it, thanks everyone.
