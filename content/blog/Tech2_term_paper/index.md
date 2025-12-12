---
title: "Term Paper on Survey Signals: How Gender, Education, and Numeracy Shape Inflation Expectations (2015-2025)"
summary: Walkthrough of our Tech2 term paper notebook with the full code, results, and commentary.
date: 2025-12-12
authors:
  - Einar Storvestre, Olav Lidal and Kai Thomas
tags:
  - Tech2
  - Jupyter
  - Education
  - Research
featured: true
cover:
  image: featured.jpg  # Auto-detected from cover image in this folder
  icon:
    name: ""
image:
  image: featured.jpg
  caption: "Snapshot of our findings"
  focal_point: Center
  placement: 1
content_meta:
  trending: true
---
For the Tech2 term paper, Olav, Kai and I made a data-driven paper exploring how events, gender, education and numeracy shape expecatations for inflation, stock prices and housing prices in the 10 year period (2015-2025) based on data from [Survey of Consumer Expectations (SCE)](https://www.newyorkfed.org/microeconomics/sce#/). Including how anchored the current inflation is in forming believes for expecations about the future across genders.

This post embeds the actual working notebook, so you can skim the highlights, copy individual cells, or download the full artifact.

{{< toc mobile_only=true is_open=true >}}

## Project overview

- **Goal:** Look at correlations between gender and education and future expecations on macroeconomic expectations.
- **Tools:** Python, pandas, NumPy, Mathplotlib and glob.
- **Outputs:** Cleaned datasets, annotated code blocks, and executive-friendly figures pulled directly from the notebook outputs.

The notebook is structured as a narrative, moving from data ingestion to exploratory work, and finally into the polished presentation-ready charts. Each section contains the exact code we ran along with the inline conclusions that informed the written report.

## Explore the notebook

{{< notebook
    src="tech2_term_paper_25.ipynb"
    title="tech2_term_paper_25"
    show_metadata=true
    line_numbers=true
    dense=false
    download_label="Download Tech2 notebook"
    show_outputs=true
>}}

> [!NOTE]
> The JSON and HTML outputs have been preserved so you can trace the intermediate calculations that shaped the final presentation deck.

## Key takeaways

1. **Men are, on average, more optimistic than women**  
   Across multiple measures, male respondents report higher expectations and confidence levels, even after controlling for background variables.

2. **The gender gap is consistent but not uniform**  
   Differences vary by subgroup and context, suggesting that optimism is shaped by both demographics and situational factors.

3. **Data structure matters for interpretation**  
   Small changes in grouping or normalization materially affect the magnitude—but not the direction—of the observed effects.
