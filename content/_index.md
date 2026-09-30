---
# Leave the homepage title empty to use the site title
title: ''
date: 2022-10-24
type: landing

design:
  # Default section spacing
  spacing: '6rem'

sections:
  - block: resume-biography-3
    content:
      # Choose a user profile to display (a folder name within `content/authors/`)
      username: me
      text: ''
      # Show a call-to-action button under your biography? (optional)
      headings:
        about: ''
        education: ''
        interests: ''
    design:
      # Use the new Gradient Mesh which automatically adapts to the selected theme colors
      background:
        gradient_mesh:
          enable: true

      # Name heading sizing to accommodate long or short names
      name:
        size: balanced # Options: compact (long names), balanced (default), display (short names)

      # Avatar customization
      avatar:
        size: medium # Options: small (150px), medium (200px, default), large (320px), xl (400px), xxl (500px)
        shape: circle # Options: circle (default), square, rounded
  - block: markdown
    content:
      title: '📚 About Me'
      subtitle: ''
      text: |-
        I am a student at Norwgian School of Economics studying Business, Economics and Data Science. I have interests in AI, entrepeneurship, sports and global challanges.
        
        Please reach out if you have any questions :)
    design:
      columns: '1'
  # - block: collection
  #   id: papers
  #   content:
  #     title: Featured Publications
  #     filters:
  #       folders:
  #         - publications
  #       featured_only: true
  #   design:
  #     view: article-grid
  #     columns: 2
  - block: collection
    id: notebooks
    content:
      title: Featured Notebooks
      text: 'Highlights from my notebook lab, including the Tech2 term paper deep dive.'
      filters:
        folders:
          - blog
        featured_only: true
    design:
      view: card
      columns: 1
  # - block: collection
  #   id: talks
  #   content:
  #     title: Recent & Upcoming Talks
  #     filters:
  #       folders:
  #         - events
  #   design:
  #     view: card
  - block: collection
    id: news
    content:
      title: Recent Projects
      subtitle: ''
      text: ''
      # Page type to display. E.g. post, talk, publication...
      page_type: blog
      # Choose how many pages you would like to display (0 = all pages)
      count: 10
      # Filter on criteria
      filters:
        author: ''
        category: ''
        tag: ''
        exclude_featured: false
        exclude_future: false
        exclude_past: false
        publication_type: ''
      # Choose how many pages you would like to offset by
      offset: 0
      # Page order: descending (desc) or ascending (asc) date.
      order: desc
    design:
      # Choose a layout view
      view: card
      # Reduce spacing
      spacing:
        padding: [0, 0, 0, 0]
  # Vaktmester-badgen (dødmannsknapp for driftssentralen på Mac-en).
  # KILDE: Agenter_Claude/Vaktmester-agent/nettside/custom_body.html — rediger DER,
  # og regenerer denne fila med kommandoen i nettside-avsnittet i README.
  # Usynlig seksjon (padding 0); selve badgen er position:fixed nede til høyre, kun forsiden.
  - block: markdown
    content:
      title: ''
      subtitle: ''
      text: |-
        <div id="vaktmester-badge" style="display:none" aria-live="polite">
          <svg id="vaktmester-frisk" width="64" height="64" viewBox="0 0 96 96" role="img" aria-label="Livlig vaktmester">
            <path d="M20 20l1.6 3.4 3.4 1.6-3.4 1.6L20 30l-1.6-3.4L15 25l3.4-1.6z" fill="#f5c84c"/>
            <path d="M79 52l1.2 2.6 2.6 1.2-2.6 1.2L79 59.6l-1.2-2.6-2.6-1.2 2.6-1.2z" fill="#f5c84c"/>
            <line x1="70" y1="16" x2="63" y2="70" stroke="#a26a2f" stroke-width="3.2" stroke-linecap="round"/>
            <path d="M56 68l14 3-2.5 13-14.5-5z" fill="#e8b93c"/>
            <rect x="60" y="64" width="11" height="5" rx="2" transform="rotate(12 65 66)" fill="#8a6a45"/>
            <circle cx="44" cy="30" r="13" fill="#ffd9b3"/>
            <path d="M31 27a13 13 0 0 1 26 0z" fill="#2f6fed"/>
            <rect x="27" y="25" width="34" height="4.5" rx="2.2" fill="#2456c4"/>
            <circle cx="39" cy="32" r="1.8" fill="#333"/>
            <circle cx="49" cy="32" r="1.8" fill="#333"/>
            <circle cx="36" cy="35.5" r="1.7" fill="#ffb3a0" opacity=".75"/>
            <circle cx="52" cy="35.5" r="1.7" fill="#ffb3a0" opacity=".75"/>
            <path d="M39 37q5 4.5 10 0" stroke="#b4552d" stroke-width="1.8" fill="none" stroke-linecap="round"/>
            <rect x="33" y="44" width="22" height="27" rx="9" fill="#2f6fed"/>
            <rect x="40" y="52" width="8" height="6" rx="1.5" fill="#fff" opacity=".85"/>
            <path d="M34 50q-8 3-9 11" stroke="#2f6fed" stroke-width="6.5" fill="none" stroke-linecap="round"/>
            <circle cx="25" cy="61" r="3.2" fill="#ffd9b3"/>
            <path d="M54 50q8-3 11-9" stroke="#2f6fed" stroke-width="6.5" fill="none" stroke-linecap="round"/>
            <circle cx="66" cy="40" r="3.2" fill="#ffd9b3"/>
            <rect x="35.5" y="68" width="7.5" height="12" rx="3.4" fill="#1e3f8f"/>
            <rect x="45" y="68" width="7.5" height="12" rx="3.4" fill="#1e3f8f"/>
            <ellipse cx="38.5" cy="82" rx="5" ry="2.6" fill="#38414f"/>
            <ellipse cx="49.5" cy="82" rx="5" ry="2.6" fill="#38414f"/>
          </svg>
          <svg id="vaktmester-sliten" width="64" height="64" viewBox="0 0 96 96" role="img" aria-label="Sliten vaktmester" style="display:none">
            <text x="64" y="30" font-size="8" fill="#94a3b8" font-family="sans-serif">z</text>
            <text x="71" y="21" font-size="11" fill="#94a3b8" font-family="sans-serif">z</text>
            <text x="79" y="12" font-size="14" fill="#94a3b8" font-family="sans-serif">Z</text>
            <line x1="16" y1="85" x2="76" y2="70" stroke="#8a7a63" stroke-width="3" stroke-linecap="round"/>
            <path d="M74 64l12 4-4 11-12-6z" fill="#c2b087"/>
            <g transform="rotate(-7 44 60)">
              <circle cx="44" cy="30" r="13" fill="#f2cfae"/>
              <g transform="rotate(-10 44 22)">
                <path d="M31 27a13 13 0 0 1 26 0z" fill="#6b7280"/>
                <rect x="27" y="25" width="34" height="4.5" rx="2.2" fill="#565e6a"/>
              </g>
              <path d="M36.5 32.5h4.5" stroke="#4b5563" stroke-width="1.8" stroke-linecap="round"/>
              <path d="M47 32.5h4.5" stroke="#4b5563" stroke-width="1.8" stroke-linecap="round"/>
              <path d="M40 38.5q4-3 8 0" stroke="#8c6650" stroke-width="1.8" fill="none" stroke-linecap="round"/>
              <rect x="33" y="44" width="22" height="27" rx="9" fill="#7d8aa5"/>
              <rect x="40" y="52" width="8" height="6" rx="1.5" fill="#e5e9f0" opacity=".8"/>
              <path d="M34 50q-9 5-8 14" stroke="#7d8aa5" stroke-width="6.5" fill="none" stroke-linecap="round"/>
              <circle cx="26" cy="65" r="3.2" fill="#f2cfae"/>
              <path d="M54 50q9 4 9 13" stroke="#7d8aa5" stroke-width="6.5" fill="none" stroke-linecap="round"/>
              <circle cx="63" cy="64" r="3.2" fill="#f2cfae"/>
              <rect x="35.5" y="68" width="7.5" height="12" rx="3.4" fill="#5a6474"/>
              <rect x="45" y="68" width="7.5" height="12" rx="3.4" fill="#5a6474"/>
              <ellipse cx="38.5" cy="82" rx="5" ry="2.6" fill="#3d4450"/>
              <ellipse cx="49.5" cy="82" rx="5" ry="2.6" fill="#3d4450"/>
            </g>
          </svg>
          <div>
            <strong>Vaktmesteren</strong>
            <span id="vaktmester-status">…</span>
          </div>
        </div>
        <style>
        #vaktmester-badge{position:fixed;right:16px;bottom:16px;z-index:40;display:none;align-items:center;gap:10px;padding:10px 15px 10px 8px;border-radius:16px;background:#fff;border:1px solid rgba(0,0,0,.08);box-shadow:0 6px 20px rgba(0,0,0,.12);max-width:290px}
        #vaktmester-badge strong{display:block;font-size:.8rem;line-height:1.25;color:#1f2733}
        #vaktmester-badge span{display:block;font-size:.72rem;line-height:1.3;color:#5b6472}
        html.dark #vaktmester-badge{background:#1c2432;border-color:rgba(255,255,255,.1);box-shadow:0 6px 20px rgba(0,0,0,.5)}
        html.dark #vaktmester-badge strong{color:#e8edf4}
        html.dark #vaktmester-badge span{color:#9aa6b8}
        @media (max-width:640px){#vaktmester-badge{right:10px;bottom:10px;padding:8px 10px 8px 6px;gap:8px;max-width:210px}}
        </style>
        <script>
        (function () {
          var p = location.pathname;
          if (p !== "/" && p !== "/index.html") return;
          var boks = document.getElementById("vaktmester-badge");
          var frisk = document.getElementById("vaktmester-frisk");
          var sliten = document.getElementById("vaktmester-sliten");
          var status = document.getElementById("vaktmester-status");
          var RAA = "https://raw.githubusercontent.com/Einar-Storvestre/Einar-Storvestre.github.io/main/static/vaktmester/status.json";
          function vis(erFrisk, tekst) {
            frisk.style.display = erFrisk ? "" : "none";
            sliten.style.display = erFrisk ? "none" : "";
            status.textContent = tekst;
            boks.title = erFrisk
              ? "Driftssentralen på Mac-en har gitt livstegn siste døgn"
              : "Driftssentralen på Mac-en har IKKE gitt livstegn på over ett døgn";
            boks.style.display = "flex";
          }
          function tolk(j) {
            var sist = new Date(j.sist);
            var timer = (Date.now() - sist.getTime()) / 36e5;
            if (!isFinite(timer)) { throw new Error("ugyldig tidsstempel"); }
            if (timer < 24) {
              var kl = sist.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
              vis(true, "På vakt · " + kl +
                (j.avvik > 0 ? " · " + j.avvik + " avvik" : " · alt i orden"));
            } else {
              vis(false, "Ingen livstegn på " + Math.floor(timer) + " timer");
            }
          }
          fetch(RAA, { cache: "no-store" })
            .then(function (r) { if (!r.ok) { throw 0; } return r.json(); })
            .catch(function () {
              return fetch("/vaktmester/status.json", { cache: "no-store" })
                .then(function (r) { if (!r.ok) { throw 0; } return r.json(); });
            })
            .then(tolk)
            .catch(function () { vis(false, "Ingen livstegn å finne"); });
        })();
        </script>
    design:
      columns: '1'
      spacing:
        padding: [0, 0, 0, 0]
---
