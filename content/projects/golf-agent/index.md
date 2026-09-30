---
title: Golf booking
date: 2026-09-29
weight: 60
summary: Matching tee times with weather and calendar availability.
authors:
- me
tags:
- Automation
- Python
- Browser Automation
project_kind: automation
links:
- name: Example walkthrough
  url: /projects/golf-agent/#try-the-workflow
---

Golf Agent checks available tee times against the forecast, my time
preferences and calendar. It sends a proposal and waits for a reply choosing
a day and time.

## When availability changes

A suggestion does not reserve a tee time. When the reply arrives, the agent
checks availability again before attempting the booking. If the time has been
taken, it offers alternatives.

Processed replies are recorded to reduce the risk of repeating a booking. The
result is checked before a confirmation is sent.

The workflow uses Python, weather data, browser automation and calendar
integration. The [weather project](/vaerdata/) explores the related data.

<details class="example-section" id="try-the-workflow">
<summary>Try an example booking</summary>
<p>This is a simplified example with fictional data. It does not connect to the live services.</p>

{{< portfolio-demo kind="golf" >}}

</details>
