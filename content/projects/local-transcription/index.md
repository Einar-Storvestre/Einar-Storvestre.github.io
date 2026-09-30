---
title: Local transcription
date: 2026-09-29
weight: 40
summary: Audio and video to timestamped text, using Whisper on a Mac.
authors:
- me
tags:
- Automation
- Python
- AI
project_kind: automation
---

This tool accepts a local recording or a supported media URL. It prepares the
audio, runs mlx-whisper and saves both a readable transcript and structured
segments with timestamps.

## Keeping the output useful

The Markdown transcript is convenient for reading and searching. The segment
file retains timestamps for further processing. Both outputs can be moved into
the project the recording belongs to.

Whisper provides the speech recognition. My work is the Python workflow around
it, including media handling with yt-dlp and conversion with ffmpeg.

The tool supports Norwegian and English. Names and technical terms need
checking, and it does not identify individual speakers.
