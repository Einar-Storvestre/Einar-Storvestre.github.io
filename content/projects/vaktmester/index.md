---
title: Vaktmester
date: 2026-09-29
weight: 30
summary: Checking whether scheduled jobs actually delivered their results.
authors:
- me
tags:
- Automation
- Python
- Monitoring
project_kind: automation
---

Vaktmester monitors the automations running on my Mac. It checks recent runs,
failure signals and the outputs each job is expected to produce.

## Checking the result

The success condition depends on the job. For a publication it can be a dated
delivery record; for a sync it can be a completed collection. A recent log or a
successful process exit is not sufficient on its own.

The monitor accounts for retry windows and temporary network failures. It
groups new problems and suppresses repeated alerts, so an existing error does
not generate the same message on every check.

State is associated with stable job names. This prevents a moved log file from
being mistaken for a fresh collection of old errors.

The wider tooling records execution time and model usage for investigation.
It is built in Python and uses local state files and macOS scheduling.

Related work: [Internship Radar](/projects/internship-radar/) and
[study sync](/projects/study-sync/).
