# Værdata

Én samlet app på `/vaerdata/` med tre underfaner: **Golfvær** (banefuktighet Bergen GK),
**Skiføre & smøring** (Haukeli/Vågslid) og **Varseltreffsikkerhet** (måler om værvarselet
systematisk bommer). Bygget som Hugo-side + shortcode + vanlig JS — ingen rammeverk, ingen server.

## Arkitektur (tre lag)

1. **Innhenting/beregning** — `scripts/fetch-vaerdata.mjs`, kjørt av
   `.github/workflows/update-vaerdata.yml` (05:45 + 17:45 UTC, samme mønster som `update-innside.yml`).
   Henter MET-varsel (snapshot FØR fasiten finnes) + NVE-observasjoner, matcher dem på identisk
   06–06 UTC-døgn og forhåndsberegner treffsikkerhet. Committer kompakt JSON med `[skip ci]`.
2. **Lagrede data** — `static/vaerdata/data/`:
   - `forecasts/{sted}-{ÅÅÅÅ-MM}.json` — varselsnapshots (48 t timeserie + 10 døgnaggregater)
   - `observations/{sted}.json` — rullende 400 døgn NVE-serier
   - `accuracy/{sted}.json` + `{sted}-pairs.json` — forhåndsberegnet statistikk + råpar
   - `latest.json` — status/feil fra siste innsamling
3. **Presentasjon** — `layouts/shortcodes/vaerdata.html` + `static/vaerdata/app.{js,css}`.
   Klienten leser statiske JSON (raw.githubusercontent → lokal fallback, som innsidehandel)
   og henter MET-varsel live (api.met.no har åpen CORS; NVE GTS har ikke → derfor server-side).

Delt modellkode: `static/vaerdata/models.mjs` (brukes av app, innsamler og tester).
Tester: `node --test scripts/test-vaerdata.mjs` (syntetiske fixtures, 19 tester).
Konfig (steder, koordinater, modellparametre): `static/vaerdata/config.json`.

## Datakilder og lisenser

| Kilde | Brukes til | Lisens |
|---|---|---|
| [MET Locationforecast 2.0](https://api.met.no/weatherapi/locationforecast/2.0/documentation) | Værvarsel (live + snapshots). Krever identifiserende User-Agent server-side; browser identifiseres via Origin. | NLOD / CC BY 4.0 |
| [NVE GridTimeSeries (GTS)](https://api.nve.no/doc/gridtimeseries-data-gts/) | «Fasit» og historikk: seNorge-grid 1×1 km, UTM33. Parametre: rr, tm, sd, fsw, sdfsw3d, lwc (snøtilstand), age, qsw, gwb_eva (fordampning), gwb_sssrel (jordvannsmetning), windSpeed10m24h06. Døgnverdien merket dato D dekker **D−1 06:00 → D 06:00 UTC** (vinduet slutter på merkedatoen — empirisk verifisert 2026-07-22 mot rr1h-timeserien; forecast-aggregatene bruker samme merking). NB: GTS svarer også med *prognoser* for fremtidige datoer uten markør — innsamleren cap'er derfor alltid på siste komplette vindu. | NLOD |

**Viktig ærlighetspoeng:** GTS-verdier er modellerte/interpolerte grid-verdier (ca. 230 temp- og
400 nedbørstasjoner bak, jf. [NVE-notat om seNorge-kartene](https://www.nve.no/media/11700/hvordan-lages-sn%C3%B8kartene-i-senorge-og-xgeo.pdf)) — ikke punktmålinger på banen/i løypa.
UI-et merker alt som [Observert]/[Varslet]/[Modellert]/[Registrert]/[Antatt]/[Mangler].

- **Frost API** (MET stasjonsdata) ble bevisst IKKE valgt: krever registrert client-ID
  (hemmelighet i repo/Actions) — GTS gir døgnfasit uten nøkkel.
- **Vind-treffsikkerhet beregnes ikke ennå:** GTS `windSpeed10m24h06` er et døgnaggregat med
  udokumentert aggregeringstype (middel vs. maks). Serien samles, men matches ikke før avklart.
- **Løypekjøring (grooming):** ingen åpen, dokumentert og lovlig-avklart automatkilde funnet
  (undersøkt 2026-07-23): loyper.net er en Next.js App Router-app med `noindex`, ingen robots.txt
  og prepareringstidspunktet gjemt i skjøre RSC-flight-payloads (ingen JSON-API); skisporet.no
  301-redirigerer og de gamle REST-endepunktene svarer ikke. Automatisk skraping ville vært skjørt
  og uten tillatelse. Løsning: manuelt skjema (localStorage) med en direkte **loyper.net-lenke per
  sted** (`loyper_url` i config) så brukeren leser «Groomed …» selv, pluss `loc`-feltet i eksporten
  som adapter-søm mot en framtidig dokumentert kilde. Grooming-features er dessuten sesonggated (nov–apr).

## Modeller (alle forklarbare, ingen ML)

- **Golf:** våthetsindeks W (mm-ekv.): `W = max(0, W·ret − 0.5·ET) + nedbør` per døgn, der
  `ET = drying_factor·gwb_eva` (dempningsfaktor ~0.8) og retensjon `ret = drenering − 0.025·ET`
  (clamp 0.55–0.97). Drenering (0.80/0.88/0.94) og dempningsfaktoren er justerbare antakelser.
  **Faglig forankring** (research 2026-07-23, adversarielt verifisert): en nedbør-minus-referanse-ET-
  balanse er etablert vanningsplanlegging (FAO-56 / Allen m.fl. 1998; NC State Extension «checkbook»-
  metode; fagfelle-review Braun m.fl. 2022, Crop Science), og cool-season turf bruker ~0,8–0,9 av
  referanse-ET0. **VIKTIG ærlighetsforbehold:** FAO-56 sin crop coefficient gjelder REFERANSE-ET0,
  men NVE `gwb_eva` sin definisjon (faktisk vs. referanse-ET) er IKKE dokumentert/verifisert — derfor
  er 0.8 her en *heuristisk dempning*, ikke en streng FAO-56 Kc. Dette er dessuten en RELATIV
  tørkeindeks, ikke absolutt jordfukt; den bør egentlig avgrenses av plantetilgjengelig vann × rotdybde
  (~10–15 cm) og effektiv nedbør, og krever ≥1 sesong kalibrering (eller en billig jordfuktsensor) for
  å bli et faktisk fukttall. Jordtype og rotdybde er de største usikkerhetene. Mulig framtidig tillegg:
  PACE Turf «growth potential» GP = e^(−0.5·((T−20)/5.5)²) som separat vekst-/aktivitetsindikator.
  Greenspeed er KATEGORI (sakte/normal/rask) — tall kommer kun fra egne vurderinger, se neste punkt.
- **Greenspeed på Einars egen 1–10-skala (kalibrert, `calibratedGreenspeed`):** oversetter
  våthetsindeksen til et tall på **Einars egen subjektive skala der 1 = tregest og 10 = raskest**.
  Dette er **IKKE Stimpmeter og ikke fot** — tallet er kun sammenlignbart med Einars egne
  vurderinger på samme bane, aldri med greenspeed oppgitt av andre baner eller kilder.
  Forankres utelukkende i egne vurderinger i `data/greenspeed-maalinger.json` (felt `verdi_1_10`).
  Sammenheng: `verdi = nivå − helning · indeks`. Fila lagrer bare selve observasjonen (dato, tid,
  sted, tall) — indeksen på måletidspunktet regnes ut på nytt ved lesing, så datasettet ikke blir
  foreldet hvis modellparametrene endres. Måletidspunktet knyttes til 06–06-døgnet som SLUTTER
  før målingen (kl. 08 norsk sommertid), altså døgn D for målinger fra kl. 08 og utover.
  Tre moduser, og forskjellen er viktig:
  - `ingen` — ingen vurderinger → intet tall, bare kategorien.
  - `forankret` — færre enn `min_points_for_fit` vurderinger, eller for lik fuktighet
    (`min_index_spread_mm`). Da bestemmer vurderingene **nivået**, mens **helningen er en ANTAKELSE
    UTEN KILDE** (`assumed_slope_per_mm`, se config.json). Linja treffer vurderingene eksakt ved
    n = 1 — det er en identitet, ikke en validering. Ingen `rmse` oppgis, fordi én vurdering ikke
    kan gi en ærlig treffsikkerhet. Tallet blir mer usikkert jo lenger banen er fra fuktigheten det
    ble vurdert ved. **Ikke presenter dette som en validert prediksjon.**
  - `tilpasset` — nok vurderinger med nok spredning → både nivå og helning er minste kvadraters
    tilpasning til egne data, og `rmse` er et reelt typisk avvik (i skalapoeng).
  Resultatet klippes til `clamp_skala` (1–10) for å hindre at ekstrapolasjon går utenfor skalaen.
  **Golf-agenten (`~/Agenter_Claude/golf/Golf-agent/banefuktighet.py`) leser SAMME fil** over
  raw.githubusercontent med lokal cache som reserve, slik at e-posten og denne siden aldri viser
  ulike tall. Merk at agenten henter NVE ferskere enn den committede observasjonsfila, så indeksen
  for samme måledato kan avvike med noen tideler — det flytter tallet under avrundingsnivå, men
  forklarer at de ikke alltid er bit-identiske.
- **Skiføre:** regelkjede over NVE-snøvariabler + temperaturforløp: regn-på-snø → våt; lwc>0 → fuktig/våt;
  mildvær/våt snø + frost nå → skare; prep på våt snø + frost → is; nysnø kald/mild → tørr/fuktig nysnø;
  alder+kulde → kald finkornet; gammel → omdannet. Nær 0 °C flagges alltid som svært usikkert.
- **Treffsikkerhet (kun Bergen):** bias/MAE/RMSE ± SE per variabel × ledetid; nedbør-hendelser
  (PoD/FAR/frekvensbias); **kalibrering** (nedbørsintervall → observert regnsannsynlighet + snitt);
  nivåtrapp for påstander (<30 par: «for lite data», <100: «tidlig tendens», deretter krav om |bias|>2·SE);
  bias-korrigering krympet med n/(n+50), walk-forward-backtestet, aktiveres KUN hvis den slår rått varsel.
  Fjellstasjonene er bevisst utelatt (for spredt datagrunnlag).
- **Ukentlig LLM-tolkning (VALGFRITT, HVILENDE):** `scripts/analyze-vaerdata.mjs` legger en språklig
  oppsummering oppå de deterministiske tallene («undervurderes regn?» osv). Koster tokens og kjører
  ALDRI før (a) `ANTHROPIC_API_KEY` er satt som GitHub-secret OG (b) det finnes ≥30 par. Modell:
  claude-opus-4-8 (overstyr med `VAERDATA_MODEL`). Estimert kost ~0,03 USD/kjøring (ANSLAG, ~3000+600
  tokens × $5/$25 per 1M, kilde: Anthropic-prisliste) → ~1,6 USD/år ukentlig. Workflow
  `analyze-vaerdata.yml` er `workflow_dispatch`-only til schedule-blokken avkommenteres.

## Drift

- Første innsamling er kjørt lokalt (90 døgn observasjons-backfill). Workflowen aktiveres først
  når repoet pushes — ingen hemmeligheter kreves.
- Koordinater: Bergen GK = **Åstveit 60.4484/5.3162** (60 moh), samme punkt som golf-agentens
  `config.env`. **Rettet 2026-07-30:** appen brukte først `vaer.py` sine *fallback*-defaults
  (60.4039/5.3327, 84 moh) — ~5 km sør av banen, en annen NVE grid-celle. Observasjonshistorikk og
  varsel-snapshots for Bergen ble nullstilt og backfillet på nytt for riktig celle (ingen par var
  dannet, så ingen statistikk gikk tapt). Vågslid/Haukeliseter er fortsatt ANTATTE punkt
  (grid-celler på 984/944 moh) — juster i `config.json` ved behov.
- **Samme modell brukes av golf-agenten lokalt** (`Agenter_Claude/Golf-agent/banefuktighet.py`),
  som setter forventet banefuktighet + greenspeed inn i booking-mailen. Endrer du `golf_model`-
  parametrene her, endre `FUKT_*` i golf-agentens `config.env` også — ellers spriker mail og nettside.
- Manuell kjøring: `node scripts/fetch-vaerdata.mjs static`
