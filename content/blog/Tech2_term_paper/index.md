---
title: "Term Paper on Survey Signals: How Gender, Education, and Numeracy Shape Inflation Expectations (2015-2025)"
summary: Walkthrough of our Tech2 term paper notebook with the full code, results, and commentary.
date: 2025-12-12
authors:
  - "Einar Storvestre, Olav Lidal and Kai Thomas"
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
For the Tech2 term paper, Olav, Kai and I made a data-driven paper exploring how events, gender, education and numeracy shape expectations for inflation, stock prices and housing prices in the 10 year period (2015-2025) based on data from [Survey of Consumer Expectations (SCE)](https://www.newyorkfed.org/microeconomics/sce#/). Including how anchored the current inflation is in forming beliefs for expectations about the future across genders.

This post embeds the actual working notebook, so you can skim the highlights, copy individual cells, or download the full artifact.

{{< toc mobile_only=true is_open=true >}}

## Project overview

- **Goal:** Look at correlations between gender and education and future expectations about macroeconomic trends.
- **Tools:** Python, pandas, NumPy, Matplotlib and glob.
- **Outputs:** Cleaned datasets, annotated code blocks, and executive-friendly figures pulled directly from the notebook outputs.

The notebook is structured as a narrative, moving from data ingestion to exploratory work, and finally into the polished presentation-ready charts. Each section contains the exact code we ran along with the inline conclusions that informed the written report.

## Explore the notebook

<style>
.tech2-notebook .nb-output pre,
.tech2-notebook .nb-code pre {
  white-space: pre;
  overflow-x: auto;
}
.tech2-notebook .nb-frame {
  width: 100%;
}
</style>

<div class="tech2-notebook">
{{< notebook
    src="tech2_term_paper_25.ipynb"
    title="tech2_term_paper_25"
    show_metadata=true
    line_numbers=true
    dense=false
    show_outputs=true
>}}
</div>

<div class="tech2-downloads">
  <a class="btn btn-sm" href="/tech2_term_paper_25.ipynb">Download Tech2 notebook</a>
  <a class="btn btn-sm btn-outline" href="/uploads/environment.yml">Download environment.yml</a>
</div>

> [!NOTE]
> The outputs have been preserved so you can trace the intermediate calculations that shaped the final results.

## Key takeaways

1. **Demographics drive expectation bias**  
   Men, college‑educated respondents, and high‑numeracy households consistently expect lower inflation, milder housing gains, and stronger equity performance. Women, non‑college, and low‑numeracy groups price in higher inflation and house-price growth but remain skeptical about stocks. Numeracy amplifies optimism even within the same education tier.

2. **Macro shocks move all groups—but unequally.**  
   US elections, COVID-19, and the Ukraine invasion triggered sharp shifts in inflation, housing, and equity expectations across every demographic, yet less-educated and low-numeracy respondents “swing” farther—especially on inflation—while college/high-numeracy cohorts stay steadier. Gender differences surface mainly in volatility (women react more to household-price pressures).

3. **Expectations are adaptive, not predictive**  
   Forward-looking correlations between expected and realized inflation are only moderate 
   (≈0.55 for both genders), while backward-looking correlations exceed 0.80. Both genders extrapolate recent inflation rather than anticipate future moves, tending toward pessimistic bias; neither group is significantly better at forecasting.
