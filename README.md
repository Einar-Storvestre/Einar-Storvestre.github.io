# Einar Storvestre

Personal portfolio built with Hugo. The site uses original layouts and CSS,
with selected work on the homepage and a complete project index.

## Structure

- Content lives in `content/`
- The homepage selection and project groups live in `data/portfolio.yaml`
- Page layouts live in `layouts/`
- The main stylesheet is `assets/css/portfolio.css`
- Existing standalone tools and generated data live in `static/`
- Source Serif 4 and Source Sans 3 are served locally from `static/fonts/`

Read [the design rules](docs/design.md) before changing the presentation.
Keep existing tool URLs, the original notebook and report downloads working.
The portfolio has no CV, experience section or personal contact section.

## Development

The deployment uses Hugo 0.152.2, currently pinned in `hugoblox.yaml` for
compatibility with the existing workflow. The Blox theme is no longer imported.

```text
hugo server --disableFastRender
```

The interactive example tests require Node 20 or newer:

```text
npm run test:portfolio
```

The examples use fictional data and temporary page state. They must not call
live booking, email or model services.

## Credits

The [original MIT notice](LICENSE.md) is retained with the starter material.
The independently written layouts do not modify a theme licence check.
Adobe's font licences are included beside the font files:
[Source Serif 4](static/fonts/OFL-SourceSerif4.md) and
[Source Sans 3](static/fonts/OFL-SourceSans3.md).
