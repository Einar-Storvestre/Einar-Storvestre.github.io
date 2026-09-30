---
title: Internship Radar
date: 2026-09-29
weight: 20
summary: Job listings from several sources, brought together in one report.
authors:
- me
tags:
- Automation
- Python
- AI
project_kind: automation
links:
- name: Example walkthrough
  url: /projects/internship-radar/#try-the-workflow
---

Radar collects internship listings from job boards and company websites. It
keeps the original links, merges duplicates and applies matching rules. A
separate AI review checks a broader set of candidates before a report is
prepared.

## Collection and delivery

The report is prepared before it is sent. A listing is marked as seen only
after delivery succeeds. If sending fails, the next attempt can still include
it.

When an AI response cannot be validated, the listings remain available for
manual review. These are the two decisions illustrated in the example below.

The implementation uses Python, structured data and email delivery.
[Vaktmester](/projects/vaktmester/) checks the expected outcome of the scheduled
jobs.

<details class="example-section" id="try-the-workflow">
<summary>Explore the report workflow</summary>
<p>This is a simplified example with fictional data. It does not connect to the live services.</p>

{{< portfolio-demo kind="radar" >}}

</details>
