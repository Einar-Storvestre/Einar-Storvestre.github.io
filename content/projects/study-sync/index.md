---
title: Study sync
date: 2026-09-29
weight: 50
summary: Course material and personal notes organised in a local workspace.
authors:
- me
tags:
- Automation
- Python
- Data Integration
project_kind: automation
---

I built separate sync workflows for Canvas, OneNote and GoodNotes. Each source
needs its own collection method; the resulting files are organised by course.

Canvas supplies course files, assignments and announcements. My OneNote notes
are exported to Markdown, while GoodNotes material is mirrored as text and PDF
outputs.

## Preserving the source material

A sync can replace its own output. Explanations, study aids and other derived
work therefore have separate locations, so the next collection does not
silently overwrite them.

Completion records are written after the collection finishes.
[Vaktmester](/projects/vaktmester/) uses those records to check freshness.
The course material and personal notes remain private.
