---
title: Haircut booking
date: 2026-09-29
weight: 70
summary: A recurring appointment workflow with an explicit confirmation step.
authors:
- me
tags:
- Automation
- Python
- API Integration
project_kind: automation
links:
- name: Example walkthrough
  url: /projects/haircut-agent/#try-the-workflow
---

The agent uses the previous appointment and a configurable interval to decide
when to check for another haircut. It finds suitable times, compares them with
calendar availability and sends a proposal. A reply must select an offered
time before booking.

## A request can finish after the connection drops

If the connection fails after a booking request is sent, the appointment may
already exist. The agent records the outcome as uncertain and asks for a
manual check before another attempt.

A successful availability check is also recorded only after its request
completes. This keeps a temporary network error from delaying the next useful
check.

It uses Python, an appointment API, email replies and local state. The
proposal-and-confirmation pattern is shared with [Golf Agent](/projects/golf-agent/).

<details class="example-section" id="try-the-workflow">
<summary>Try the uncertainty example</summary>
<p>This is a simplified example with fictional data. It does not connect to the live services.</p>

{{< portfolio-demo kind="haircut" >}}

</details>
