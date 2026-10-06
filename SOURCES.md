# Where the answers come from

Every answer the ViaFrei MCP server gives is built from **official open data**,
and every result says which source it came from. This page is the human-readable
copy of that list: who publishes each dataset, under which licence, whether an
answer has actually been seen to come from it, and the **attribution line** that
has to travel with the answer — shortened by one part, for a reason given where
the lines are printed.

It is not only a credits page. Several of these licences put obligations on
**you** — the person or product that receives a tool result — and two of them
can be breached without noticing. Those two are first, before the catalogue.

The authoritative, always-current register is the resource
**`viafrei://attribution`** on the server itself. Any MCP client can read it. If
this page and that resource ever disagree, the resource is right and this page is
stale: tell us and we will fix it. Every row of the catalogue below was compared
with that resource as served by server 1.8.18 on 2026-10-06, and none disagrees.
Whatever the surfaces say, the answer you hold is the thing to read:
`_meta.sources` and the attribution lines on it are produced from the same result
you are looking at.

---

## Two obligations that bind the reader

### Fuel prices are consumer information only

Fuel prices come from **MTS-K**, the Markttransparenzstelle für Kraftstoffe at
the Bundeskartellamt, through Tankerkönig. German competition law
(§ 47k GWB) lets a consumer-information service receive them **for one purpose
only**: telling consumers what fuel costs right now.

What that means for you, in plain words:

- **Use a price to inform the person who asked, and for nothing else.** The
  MTS-K's own guidance (*Informationen der Markttransparenzstelle für
  Kraftstoffe zur Verwendung der von ihr zur Verfügung gestellten Daten*, Stand
  26 February 2025, read 2026-10-06) calls any other use unlawful and says the
  form makes no difference — "ob es sich um Echtzeit-Daten oder ältere Daten, um
  Rohdaten, umformatierte Daten oder aggregierte Daten handelt". Products built
  from the data, "beispielsweise Analysen", are caught too, and a third party
  that receives the data may use it "ebenfalls ausschließlich zu Zwecken der
  Verbraucherinformation".
- **Do not redistribute it.** Not the raw price, not a table, not a comparison,
  not an average, not a chart. That is **our** condition, and it is stricter than
  the guidance's wording on purpose: the guidance holds the supplier responsible
  for how its recipients use the data, and a copy passed on is a use nobody
  upstream can see any more.
- **Never let it reach the fuel industry.** Not mineral-oil companies, station
  operators, their trade bodies, and not the IT providers working for them
  (price reporters, till-system and fuel-card vendors, station IT) — the
  guidance names each of these. If your recipient might pass it on to that
  sector, you may not supply them either. Tankerkönig's own terms say the same
  of the data it hands out: it may be neither obtained by those companies "noch
  … an diese weitergegeben werden".
- The consequence of getting this wrong is not a style complaint: the guidance
  says misuse "kann zum Widerruf der Zulassung als VID-Anbieter führen" — the
  approved service loses its admission, and every service downstream of it,
  ours included, loses the data.

### Public-transport realtime is share-alike

Realtime public-transport data from **DELFI e.V.** is published under a Creative
Commons **Attribution-ShareAlike** licence, and since server 1.8 there are
**four** such feeds behind the answers, not one:

- the GTFS-RT Trip Updates (punctuality) — **CC BY-SA, no version stated**;
- the SIRI ET rail realtime — **CC BY-SA, no version stated**;
- the two disruption feeds, GTFS-RT Service Alerts and SIRI SX — **CC BY-SA 4.0**.

Not all public-transport data is share-alike. DELFI's static timetable and its
stop directory are **CC BY 4.0**, and so is VBB's own realtime feed, which answers
for Berlin and Brandenburg. The line on the answer says which one you have.

**Where the version is unstated, this page does not invent one** — see the
section on the realtime feed below for what the catalogue and the access point
actually state. Treat the share-alike as applying; do not rely on a particular
version for a derivative. The server, for its part, licenses **its own**
adaptation of each of these feeds under CC BY-SA 4.0 and says so on the answer;
that is its choice for what it passes on, not a statement of the source's
version. Share-alike means the obligation travels:

- anything you derive from it — a table of delays, a punctuality figure, a
  screen that reuses the numbers — has to be offered under BY-SA too;
- **share-alike reaches adaptations, not aggregations.** If you *modify* the
  data — recompute it, reshape it, **rearrange** it, build a delay table or a
  punctuality series out of it — what you made is Adapted Material under
  art. 1(a), which names material "translated, altered, **arranged**,
  transformed, or otherwise modified", and you must license it under BY-SA
  (art. 3(b)(1)) and pass the licence URI on (art. 3(b)(2)). An arrangement is
  therefore inside the obligation, not outside it. If you merely **show** it
  next to data from another source, that is an aggregation and no ShareAlike
  obligation touches the other source.

  The words quoted above come from the **4.0** text, because 4.0 is the
  text we read (re-read 2026-10-06). **Which version applies to the two
  unversioned feeds is the open question set out below**, and this page does
  not guess what another version's definition says: the vocabulary the
  catalogue draws on offers three terms — unversioned, 3.0 DE and 4.0 — and the
  middle one is a German port whose definitions are in German.

  Creative Commons' own position, on its wiki page *ShareAlike
  interpretation*: "The ShareAlike condition applies only for works considered
  adaptations under copyright law, not simply in collections with other works".
  An earlier version of this page said you may not blend it into a work under a
  different licence. That was wrong in the direction that matters — it told you
  a licence forbids something it permits — and it would have condemned our own
  service, since a punctuality answer names the BY-SA realtime feed beside the
  CC BY timetable;
- the attribution line stays with it, either way.

**Our side.** The server keeps the SIRI ET calls and the service alerts as two
separate share-alike databases, joined to nothing else, and shows each in a
block of its own: SIRI ET only in `get_train_departures`, when DB Timetables has
no realtime for the station, and alerts only in `check_transit_disruption`,
beside the delay figures. Its register offers both, as CSV with a note of our
alterations, under CC BY-SA 4.0 and free of charge, on request to the contact
address in the Impressum on viafrei.de.

If that is not what you want for your product, ask for the same answer from a
source that is not BY-SA, or keep the two apart.

### And one that applies if you get an OpenStreetMap-derived result back

Some answers are built from **OpenStreetMap**, under the **ODbL 1.0**. Address
and point-of-interest lookups always are; so is any other answer whose place our
own gazetteer could not resolve, because place resolution falls through to the
OSM tables. The public service gives such answers: in the 2026-10-06
measurement below, **97** answers from eight different tools named `osm` —
`find_address`, `find_poi`, `describe_location`, `find_nearby`, `find_parking`,
`check_weather_warnings` and both fuel tools. So **this binds you** as soon as
one of those tables answered you.

You can tell which answers are affected without guessing, and the test is the
answer rather than the question: the result carries
`OSM-Standortdaten: © OpenStreetMap-Mitwirkende, ODbL 1.0` and names `osm` in
`_meta.sources`. What decides it is **which table answered**, not which tool you
called and not what your input looked like. A place the server resolved from its
own gazetteer does not carry the line, and neither does a station or a motorway;
a place it resolved from OpenStreetMap does — so **any** tool that takes a
`place` can come back with an OSM-derived answer. Measured on 2026-09-27: a
weather warning asked for `Zeiss-Großplanetarium` named `["dwd","osm"]` and
carried the ODbL line. So "did I ask for an address?" is the wrong question, and
so is "is this a geocoding tool?" — **read `_meta.sources` and the attribution
line on the answer you actually got.**

ODbL's share-alike is on the *database*, not on the sentence: if you build your
own database out of address or point-of-interest results and use it publicly, you
owe your recipients the same offer we make. **Our side of that offer stands** —
ODbL § 4.6 — and the server states it in `viafrei://attribution`: ask, and you get
**both** our extracts — addresses and points of interest, one file each — and our
alterations to them, under ODbL 1.0, free of charge, from the contact address in
the Impressum on viafrei.de. An issue on this repository reaches us too.

### And two parking sources that are share-alike

`find_parking` answers from many publishers (the full list is in the catalogue
below), and two of them are share-alike:

- **P+R NRW** (NRW.Mobidrom, the bundled Park+Ride data for North
  Rhine-Westphalia) is **CC BY-SA**, with no version stated — the same
  share-alike reasoning as the DELFI realtime feed above applies;
- **Trucklounge Ecopark** (ENMO GmbH & Co.KG, lorry parking) is **ODbL 1.0** — a
  second share-alike *database*, separate from OpenStreetMap and never joined to
  it or to any other source.

The server keeps both apart from everything else rather than mixing them into one
list: the tool's own description says "ODbL and CC BY-SA sources are separate
lists (up to three)". Measured on 2026-10-05, a park-and-ride question for
Düsseldorf came back with the P+R NRW sites in a list of their own, each row
carrying `"license": "CC BY-SA"` and its own attribution line, and a lorry-parking
question near Emstek returned the Trucklounge site in a separate ODbL list. So
the test is the same as for OpenStreetMap: **read `_meta.sources` and the
attribution line on the answer you got** — `mobilithek_park_nrw_pr`,
`mobilithek_park_trucklounge` and `mobilithek_park_trucklounge_occ` are the ids
to look for. If you keep those rows, keep them apart too, and carry their licence
with them.

For the ODbL database the server makes the same § 4.6 offer as for the OSM
tables, stated in `viafrei://attribution`: its complete contents and our
alterations, under ODbL 1.0, free of charge on request to the contact address in
the Impressum on viafrei.de. The same request also gets the P+R NRW data under
CC BY-SA 4.0 — not an ODbL duty, the register says, but the same channel.

---

## The catalogue

**Status is not a promise, it is a measurement.** Every status below was measured
on **2026-10-06, between 19:52 and 20:17 UTC** (21:52–22:17 Berlin time), against
the production server, which was then at **1.8.17**. A round of 1,000 questions —
500 in German, 500 in English, worded the way people ask — produced **1,081 tool
answers**, and each source's status is read off one field of those answers: how
many of them named it in `_meta.sources`. Not the code, not whether a feed was
running, not the register's opinion of itself. A source can be licensed, cleared
and loaded and still not answer a question; where that is so, the row says so.

As of the capture shipped alongside this page (2026-10-06, server 1.8.18),
it exposes twenty-one tools, nineteen of them read-only, and the round called
every one of them — **including both fuel tools, `find_cheapest_fuel` and
`find_fuel_station`.** That was a one-off decision, taken before the round, and
it is not the routine. Tankerkönig limits how often its interface may be asked,
and its terms say plainly that bulk retrieval is blocked and the key deactivated,
so a routine re-check leaves both fuel tools out.
That would now mean **seventeen** live calls — the read-only tools minus the two fuel tools — and it
would measure less than this round did, which is why the round is the measurement
and this paragraph is dated rather than refreshed on a schedule.

**One difference between the round and this page matters.** On 1.8.17,
`check_transit_disruption` timed out on 33 of its 64 calls, almost all of them
questions about a whole region; 1.8.18 fixed that, and a whole-Land question for
Bayern answered on 1.8.18 at 21:09 UTC the same evening. So the public-transport
counts below are lower than the same questions would produce today: a small count
there is undercounted, not marginal.

- **live (n)** — at least one answer in the round named it; *n* is how many of
  the 1,081 did. A count is per answer, not per question, so a source that
  resolves places counts every answer it helped with.
- **in the service** — the server's register lists the source as held, and no
  answer in the round named it. It is reported as unconfirmed rather than as
  live; what is known about why is under the table.
- **read** — the register says "licence read, data not ingested yet". No answer
  can name it today; the row is here because a licence that has been read is
  part of the record.

Of the 69 rows — the register in full, one row per id it lists — **47 are live, 13
in the service and 9 read.** The id in the first column is the one that appears in
`_meta.sources`; the line in the second is the attribution line the answer
carries, without the URI that follows it in parentheses (why is explained
[below](#the-sources-in-detail)). Publication rhythm and freshness are not in the
table: the server reports them per feed, live, in the resource
`viafrei://coverage`.

| Source id | Attribution line | Licence | Status |
|---|---|---|---|
| **Roads** | | | |
| `autobahn` | Verkehrsdaten: Autobahn GmbH des Bundes | open, no licence text published | live (206) |
| `mobilithek_roadworks_bast` | Arbeitsstellen: Bundesanstalt für Straßen- und Verkehrswesen (BASt) via Mobilithek, CC BY 4.0, bearbeitet | CC BY 4.0 | live (59) |
| `mobilithek_roadworks_ald_ni` | Arbeitsstellen Niedersachsen: Niedersächsische Landesbehörde für Straßenbau und Verkehr via Mobilithek, Datenlizenz Deutschland – Zero – Version 2.0 | dl-de/zero-2-0 | live (5) |
| `mobilithek_roadworks_ald_sn` | Arbeitsstellen Sachsen: Landesamt für Straßenbau und Verkehr des Freistaates Sachsen (LASuV) via Mobilithek, CC BY 4.0, bearbeitet | CC BY 4.0 | live (7) |
| `mobilithek_roadworks_ald_th` | Arbeitsstellen Thüringen: © Thüringer Landesamt für Bau und Verkehr (TLBV) 2026 — GeoNutzV, Daten verändert | GeoNutzV | live (2) |
| `mobilithek_nms_events` | Verkehrsmeldungen der Polizei: Landesbetrieb Straßenbau NRW (VIZ.NRW) via Mobilithek, Datenlizenz Deutschland – Zero – Version 2.0 | dl-de/zero-2-0 | live (2) |
| `mobilithek_traffic_bw` | Verkehrsmeldungen Baden-Württemberg: Landesmeldestelle für den Verkehrswarndienst Baden-Württemberg (Innenministerium Baden-Württemberg) via Mobilithek, Datenlizenz Deutschland – Namensnennung – Version 2.0 (www.govdata.de/dl-de/by-2-0), Daten verändert | dl-de/by-2-0 **plus a condition of use** | live (4) |
| `mobilithek_traffic_berlin` | Verkehrsmeldungen Berlin: Senatsverwaltung für Mobilität, Verkehr, Klimaschutz und Umwelt Berlin via Mobilithek, Datenlizenz Deutschland – Namensnennung – Version 2.0 (www.govdata.de/dl-de/by-2-0), Daten verändert | dl-de/by-2-0 | in the service |
| `mobilithek_traffic_koeln_events` | Verkehrsereignisse Köln: Stadt Köln via Mobilithek, Datenlizenz Deutschland – Zero – Version 2.0 | dl-de/zero-2-0 | in the service |
| `mobilithek_traffic_sh` | Verkehrsmeldungen Schleswig-Holstein: Landesmeldestelle Polizei Schleswig-Holstein via Mobilithek, Open Data (freie Nutzung) | "Open Data (freie Nutzung)" — see below | live (4) |
| `mobilithek_traffic_hannover` | Verkehrsmeldungen Hannover: Landeshauptstadt Hannover – Fachbereich Tiefbau via Mobilithek, Open Data (freie Nutzung) | "Open Data (freie Nutzung)" — see below | in the service |
| `mobilithek_traffic_koeln_static` | Verkehrslage Köln (Streckenabschnitte): Stadt Köln via Mobilithek, Datenlizenz Deutschland – Zero – Version 2.0 | dl-de/zero-2-0 | read |
| `mobilithek_traffic_koeln_dyn` | Verkehrslage Köln: Stadt Köln via Mobilithek, Datenlizenz Deutschland – Zero – Version 2.0 | dl-de/zero-2-0 | read |
| `mobilithek_roadweather_sh_static` | Straßenwetter Schleswig-Holstein (Messstellen): Landesbetrieb Straßenbau und Verkehr Schleswig-Holstein (LBV.SH) via Mobilithek, Datenlizenz Deutschland – Zero – Version 2.0 | dl-de/zero-2-0 | read |
| `mobilithek_roadweather_sh_dyn` | Straßenwetter Schleswig-Holstein: Landesbetrieb Straßenbau und Verkehr Schleswig-Holstein (LBV.SH) via Mobilithek, Datenlizenz Deutschland – Zero – Version 2.0 | dl-de/zero-2-0 | read |
| **Rail and public transport** | | | |
| `db_timetables` | Fahrplandaten: Deutsche Bahn AG, DB API Marketplace, CC BY 4.0, bearbeitet | CC BY 4.0 | live (78) |
| `delfi_rt_tu` | Echtzeitdaten: DELFI e.V. via Mobilithek, CC BY-SA, bearbeitet | **CC BY-SA**, no version stated | live (16) |
| `vbb_rt` | Echtzeitdaten: VBB Verkehrsverbund Berlin-Brandenburg GmbH, CC BY 4.0, bearbeitet | CC BY 4.0 | live (13) |
| `delfi_siri_et` | Echtzeitdaten Schiene: DELFI e.V. via Mobilithek, Datensatz „DELFI-Realtime SIRI ET Bahndaten“, CC BY-SA, bearbeitet | **CC BY-SA**, no version stated | in the service |
| `delfi_rt_sa` | Störungsmeldungen: DELFI e.V. via Mobilithek, Datensatz „DELFI-Datensatz GTFS-RT Service Alerts“, CC BY-SA 4.0, bearbeitet | **CC BY-SA 4.0** | live (3) |
| `delfi_siri_sx` | Störungsmeldungen: DELFI e.V. via Mobilithek, Datensatz „DELFI-Datensatz SIRI SX“, CC BY-SA 4.0, bearbeitet | **CC BY-SA 4.0** | live (1) |
| `delfi_static` | Fahrplandaten: DELFI e.V., CC BY 4.0, bearbeitet | CC BY 4.0 | live (84) |
| `delfi_zhv` | Haltestellendaten: DELFI e.V. (zentrales Haltestellenverzeichnis), CC BY 4.0, bearbeitet | CC BY 4.0 | live (160) |
| `db_stada` | Bahnhofsdaten: Deutsche Bahn AG, DB API Marketplace, CC BY 4.0, bearbeitet | CC BY 4.0 | live (329) |
| **Station lifts and escalators** | | | |
| `db_fasta` | Aufzüge und Fahrtreppen: Deutsche Bahn AG, DB API Marketplace, CC BY 4.0, bearbeitet | CC BY 4.0 | live (2) |
| `mobilithek_openstation_netex` | Aufzüge und Fahrtreppen (Bestand): Deutsche Bahn AG / DB InfraGO AG (OpenStation) via Mobilithek, CC0 1.0 | CC0 1.0 | live (29) |
| `mobilithek_openstation_siri_fm` | Aufzüge und Fahrtreppen (Status): Deutsche Bahn AG / DB InfraGO AG (OpenStation) via Mobilithek, CC0 1.0 | CC0 1.0 | live (29) |
| `kvb_lifts` | Aufzugsdaten: Kölner Verkehrs-Betriebe AG, Datenlizenz Deutschland – Zero – Version 2.0 | dl-de/zero-2-0, no warranty | live (7) |
| **Fuel** | | | |
| `tankerkoenig` | Tankstellenpreise: Tankerkönig.de — MTS-K, CC BY 4.0, bearbeitet | CC BY 4.0 **plus the MTS-K purpose limit** | live (149) |
| **Charging** | | | |
| `bnetza_lsr` | Ladesäulenregister: Bundesnetzagentur.de, CC BY 4.0, bearbeitet | CC BY 4.0 | live (79) |
| `mobilithek_afir_ecomovement` | Ladepunkte: Eco-Movement via Mobilithek, CC BY 4.0, bearbeitet | CC BY 4.0 | live (45) |
| `mobilithek_afir_ecomovement_dyn` | Ladepunkt-Verfügbarkeit: Eco-Movement via Mobilithek, CC BY 4.0, bearbeitet | CC BY 4.0 | in the service |
| `mobilithek_afir_enbw_stat` | Ladepunkte: EnBW AG via Mobilithek, CC BY 4.0, bearbeitet | CC BY 4.0 | live (6) |
| `mobilithek_afir_enbw_dyn` | Ladepunkt-Verfügbarkeit: EnBW AG via Mobilithek, CC BY 4.0, bearbeitet | CC BY 4.0 | live (2) |
| `mobilithek_afir_tesla_stat` | Ladepunkte: Tesla Germany GmbH via Mobilithek, CC0 1.0 | CC0 1.0 | live (6) |
| `mobilithek_afir_tesla_dyn` | Ladepunkt-Verfügbarkeit: Tesla Germany GmbH via Mobilithek, CC0 1.0 | CC0 1.0 | live (7) |
| `mobilithek_afir_vw_stat` | Ladepunkte: Volkswagen Group Charging GmbH via Mobilithek, CC0 1.0 | CC0 1.0 | live (1) |
| `mobilithek_afir_vw_dyn` | Ladepunkt-Verfügbarkeit: Volkswagen Group Charging GmbH via Mobilithek, CC0 1.0 | CC0 1.0 | in the service |
| `mobilithek_afir_eclearing_stat` | Ladepunkte: e-clearing.net (smartlab Innovationsgesellschaft mbH) via Mobilithek, CC0 1.0 | CC0 1.0 | live (14) |
| `mobilithek_afir_eclearing_dyn` | Ladepunkt-Verfügbarkeit: e-clearing.net (smartlab Innovationsgesellschaft mbH) via Mobilithek, CC0 1.0 | CC0 1.0 | live (5) |
| `ocpdb_chargecloud` | Ladepunkte und Verfügbarkeit: chargecloud (CC0 1.0) via MobiData BW (NVBW), Datenlizenz Deutschland – Namensnennung – Version 2.0 (www.govdata.de/dl-de/by-2-0), Daten geändert | dl-de/by-2-0 | live (40) |
| `ocpdb_taubert` | Ladepunkte und Verfügbarkeit: Taubert Consulting (CC0 1.0) via MobiData BW (NVBW), Datenlizenz Deutschland – Namensnennung – Version 2.0 (www.govdata.de/dl-de/by-2-0), Daten geändert | dl-de/by-2-0 | in the service |
| **Parking** | | | |
| `mobilithek_truckpark_static_geonutzv` | LKW-Parken: © Lkw-Parken BAB Deutschland / Bundesministerium für Verkehr (BMV) 2026 — GeoNutzV, Daten verändert | GeoNutzV | live (62) |
| `mobilithek_park_bosch_static` | Lkw-Parken: Bosch Service Solutions via Mobilithek, CC BY 4.0, bearbeitet | CC BY 4.0 | live (5) |
| `mobilithek_park_bosch_dyn` | Lkw-Parken (Belegung): Bosch Service Solutions via Mobilithek, CC BY 4.0, bearbeitet | CC BY 4.0 | live (1) |
| `mobilithek_park_christophorus` | Lkw-Parken: Florence Knuellwald GmbH (Christophorus Parking) via Mobilithek, Datenlizenz Deutschland – Namensnennung – Version 2.0 (www.govdata.de/dl-de/by-2-0), Daten verändert | dl-de/by-2-0 | in the service |
| `mobilithek_park_christophorus_occ` | Lkw-Parken (Belegung): Florence Knuellwald GmbH (Christophorus Parking) via Mobilithek, Datenlizenz Deutschland – Namensnennung – Version 2.0 (www.govdata.de/dl-de/by-2-0), Daten verändert | dl-de/by-2-0 | in the service |
| `mobilithek_park_trucklounge` | Lkw-Parken: ENMO GmbH & Co.KG (Trucklounge Ecopark) via Mobilithek — enthält Daten aus „Trucklounge Ecopark“, Open Database License 1.0 (opendatacommons.org/licenses/odbl/1-0/), bearbeitet | **ODbL 1.0** | in the service |
| `mobilithek_park_trucklounge_occ` | Lkw-Parken (Belegung): ENMO GmbH & Co.KG (Trucklounge Ecopark) via Mobilithek — enthält Daten aus „Trucklounge Ecopark (dynamisch)“, Open Database License 1.0 (opendatacommons.org/licenses/odbl/1-0/), bearbeitet | **ODbL 1.0** | in the service |
| `mobilithek_park_koeln_static` | Parkhäuser: Stadt Köln via Mobilithek, Datenlizenz Deutschland – Zero – Version 2.0 | dl-de/zero-2-0 | live (2) |
| `mobilithek_park_koeln_dyn` | Parkhaus-Belegung: Stadt Köln via Mobilithek, Datenlizenz Deutschland – Zero – Version 2.0 | dl-de/zero-2-0 | live (2) |
| `mobilithek_park_nrw_parken` | Parkhäuser NRW: NRW.Mobidrom via Mobilithek, Datenlizenz Deutschland – Namensnennung – Version 2.0 (www.govdata.de/dl-de/by-2-0), Daten verändert | dl-de/by-2-0 | live (3) |
| `mobilithek_park_nrw_pr` | P+R NRW: NRW.Mobidrom via Mobilithek, Datensatz „Gebündelte Daten Park+Ride NRW“, CC BY-SA, bearbeitet | **CC BY-SA**, no version stated | live (2) |
| `hamburg_parkhaeuser` | Parkhäuser: Freie und Hansestadt Hamburg, Behörde für Verkehr und Mobilitätswende, Datenlizenz Deutschland – Namensnennung – Version 2.0 (www.govdata.de/dl-de/by-2-0), Daten geändert (bearbeitet) | dl-de/by-2-0 | live (3) |
| `hamburg_park_ride` | P+R-Anlagen: Freie und Hansestadt Hamburg, Behörde für Verkehr und Mobilitätswende, (BVM), Datenlizenz Deutschland – Namensnennung – Version 2.0 (www.govdata.de/dl-de/by-2-0), Daten geändert (bearbeitet) | dl-de/by-2-0 | in the service |
| `muenster_pls` | Parkhausbelegung Münster — Datenquelle: Stadt Münster, Datenlizenz Deutschland – Namensnennung – Version 2.0 (www.govdata.de/dl-de/by-2-0), Daten verändert | dl-de/by-2-0 | in the service |
| `mobilithek_park_thiersheim_dyn` | Lkw-Parken (Belegung): Bosch Service Solutions (Autohof Thiersheim) via Mobilithek, CC BY 4.0, bearbeitet | CC BY 4.0 | read |
| `mobilithek_park_sh_truck` | Lkw-Parken: Landesbetrieb Straßenbau und Verkehr Schleswig-Holstein (LBV.SH) via Mobilithek, Datenlizenz Deutschland – Zero – Version 2.0 | dl-de/zero-2-0 | read |
| `mobilithek_park_sh_truck_dyn` | Lkw-Parken (Belegung): Landesbetrieb Straßenbau und Verkehr Schleswig-Holstein (LBV.SH) via Mobilithek, Datenlizenz Deutschland – Zero – Version 2.0 | dl-de/zero-2-0 | read |
| `mobilithek_park_kiel_dyn` | Parkplätze Kieler Altstadt (Belegung): KielRegion GmbH via Mobilithek, Datenlizenz Deutschland – Namensnennung – Version 2.0 (www.govdata.de/dl-de/by-2-0), Daten verändert | dl-de/by-2-0 | read |
| `mobilithek_db_bahnpark` | Parking Information Daten der DB BahnPark – API über den DB API Marketplace | dl-de/by-2-0 | read |
| **Sharing** | | | |
| `gbfs_nextbike` | Bikesharing: nextbike GmbH (GBFS), CC0 1.0 | CC0 1.0 | live (32) |
| `gbfs_donkey` | Bikesharing: Donkey Republic (GBFS), CC0 1.0 | CC0 1.0 | live (6) |
| **Weather** | | | |
| `dwd` | Quelle: Deutscher Wetterdienst | CC BY 4.0 | live (54) |
| **Places and addresses** | | | |
| `bkg_gvisys` | Verwaltungseinheiten: © BKG (2026) dl-de/by-2-0, Datenquellen: https://sgx.geodatenzentrum.de/web_public/gdz/datenquellen/datenquellen_gn250.pdf (Daten verändert) | dl-de/by-2-0 | live (494) |
| `geonames` | Ortsdaten: © GeoNames (CC BY 4.0), bearbeitet | CC BY 4.0 | live (244) |
| `osm` | OSM-Standortdaten: © OpenStreetMap-Mitwirkende, ODbL 1.0 | **ODbL 1.0** | live (97) |
| **Our own** | | | |
| `viafrei_rules` | Verkehrsregeln: ViaFrei, eigene Zusammenstellung aus amtlichen Quellen (StVO, StVZO, 35. BImSchV, StVG, EmoG, AFIR); jede Aussage mit Quelle und Prüfdatum — informativ, keine Rechtsberatung / Road rules: ViaFrei, our own compilation from official sources; every statement carries its source and the date it was read — informational, not legal advice | our own text | live (35) |
| `viafrei_watch` | Beobachtung: ViaFrei, eigener Dienst — jede Meldung nennt die Quelle der Daten, die sie ausgelöst haben / Watch: ViaFrei, our own service — every report names the source of the data behind it | no provider data | live (41) |

What the table cannot say in a cell:

- **Fuel coverage is not nationwide.** We watch a limited set of stations, on
  the terms the publisher sets, and we ask for a station's details only when
  somebody actually asks a question. Outside that set you may get nothing back.
  That is a consequence of the MTS-K rules, not a gap we are hiding. Fuel is
  measured this time — 149 answers named it — for the one-off reason given above.
- **SIRI ET is shown only as a fallback.** `get_train_departures` adds it only when
  DB Timetables has no realtime for the station; in the round's 79 rail-departure
  answers that never happened, so it reads `in the service`.
- **Berlin traffic messages** were named by no answer in the round. One spot check
  after it — `check_road_status` for Berlin, 21:09 UTC the same evening, server
  1.8.18 — named `mobilithek_traffic_berlin`. That is one call, reported as one
  call; the table keeps the round's status.
- **Köln traffic events and Hannover** carry an entry only when the city publishes
  one; none was named. **Christophorus Parking and Trucklounge** were named on
  2026-10-05 by lorry-parking questions near Knüllwald and Emstek, and no question
  in the round asked there. For the rest of the `in the service` rows — the
  Eco-Movement and Volkswagen availability feeds, Taubert, Hamburg's P+R sites and
  Münster's car parks — this page knows nothing beyond the zero.

**What this measurement corrected.** Until 2026-10-06 this page was dated
2026-09-27 and said five things that are no longer true: that the DELFI static
timetable and stop directory were not answering (84 and 160 answers named them);
that the police traffic events were stored but never named (2 answers did); that
Bosch's lorry parks had not been seen (its master data was named 5 times, its
occupancy once); that the register
called the BKG gazetteer "not ingested yet" (it no longer does, and 494 answers
named it); and that DB BahnPark was a source this page lists as read for a product
we use (the register now carries it as planned, licence read and nothing
ingested). If you read an earlier version and concluded something was or was not
available, re-check it here — and better, in the answer.

**What settles any of this for you is the answer in your hand**: read
`_meta.sources` and the attribution lines on the result, never a status cell on a
page that was printed before you asked.

## The sources in detail

Each block gives the licence in the publisher's own words where we have it, and
the attribution line that belongs to that source. Sources whose licence asks
nothing beyond the line in the table above — CC BY 4.0, Datenlizenz Deutschland
(Zero or Namensnennung), GeoNutzV, CC0 — have no block of their own unless
something else about them matters to you.

**Reproduce the line as you received it from the server, not as it is printed
here.** The lines on this page are shortened: every attribution line in a real
tool result ends with the source URI in parentheses, and this page leaves that URI
off on purpose — a public page in this repository does not carry deep links into
the catalogues we fetch through. CC BY 4.0 § 3(a)(1)(A)(iv) makes you retain a
URI the licensor supplied, and dl-de/by-2-0 asks for "einen Verweis auf den
Datensatz (URI)", so the copy in the tool result is the one that discharges the
obligation and the copies here are for reading, not for pasting. Same text, one
part deliberately missing; if you have the result, use the result, and
`viafrei://attribution` carries every line in full.

The obligation itself is not a suggestion: CC BY 4.0 § 3 and its equivalents
terminate the grant when the condition is not met.

Why several lines end in `bearbeitet`, `Daten verändert` or `Daten geändert`
("edited", "data changed"): CC BY 4.0 § 3(a)(1)(B) makes you indicate that you
changed the material, and dl-de/by-2-0 requires changes to be marked "mit dem
Hinweis …, dass die Daten geändert wurden". An answer is always a derived form —
a parsed timetable, a summarised warning, a shortened list — so the indication is
owed, and it is part of the string rather than an afterthought.

### Die Autobahn GmbH des Bundes — motorway traffic

Roadworks, warnings, closures, webcams, lorry parking and charging points on the
Bundesautobahnen. Open interface, no key, no account.

```
Verkehrsdaten: Autobahn GmbH des Bundes
```

**Read this before you redistribute.** Autobahn GmbH publishes the data openly
but publishes **no reuse licence text** alongside it — we checked again on
2026-10-06, the traffic portal and the company's Impressum, and found none. We
therefore do not claim a grant we cannot quote: we name the source on every
answer, and we treat redistribution beyond showing the answer as an open question
with the publisher rather than as something the absence of a licence permits. If
you intend to republish it, ask them.

Publisher: <https://www.autobahn.de>

### Roadworks and traffic messages beyond the motorway interface

Roadworks come from BASt for the Bundesautobahnen and, since server 1.8, from the
Land authorities of Niedersachsen, Sachsen and Thüringen for federal and state
roads. Police and city traffic messages come from VIZ.NRW (the police reports),
Baden-Württemberg, Berlin, Schleswig-Holstein, Köln and Hannover. All of them
arrive through the national access point (Mobilithek), and their licences are in
the table. Three things about them are not:

- **Baden-Württemberg carries a condition of use.** Its messages are official
  traffic-warning-service (Verkehrswarndienst) messages, published under the
  Rahmenrichtlinie für den Verkehrswarndienst (RVWD), and the server's register
  states the condition it applies: *"The message text is shown unabridged and
  only while current."* If you pass such a message on, do the same — do not
  shorten it and do not keep showing it once it has expired.
- **Schleswig-Holstein and Hannover** are published under the access point's term
  "Open Data (freie Nutzung)", and the register names no licence text behind it.
  We name the publisher on every answer, as for the motorway interface, and claim
  no more than the label says.
- **A record its publisher marks confidential is never shown.** In DATEX II, the
  format these feeds use, a publisher marks each record with a confidentiality
  level; a record marked anything other than `noRestriction` is stored and never
  returned — not in a tool answer, a watch notice or anywhere else.

The two motorway datasets on the access point whose terms are not readable are not
consulted at all, and a road answer says so in a line of its own ("Not consulted:
… (terms not cleared for publication)", seen 2026-10-06).

The motorway lorry-parking file and the Thüringen roadworks are **GeoNutzV**,
which requires a source note *and* a note that the data was changed; the year in
the line is the year of the last download, filled in when the file is taken:

```
LKW-Parken: © Lkw-Parken BAB Deutschland / Bundesministerium für Verkehr (BMV) <Jahr des letzten Datenbezugs> — GeoNutzV, Daten verändert
Arbeitsstellen Thüringen: © Thüringer Landesamt für Bau und Verkehr (TLBV) <Jahr des letzten Datenbezugs> — GeoNutzV, Daten verändert
```

Datenlizenz Deutschland – Zero – 2.0, the licence of the VIZ.NRW police events and
several others in the table, attaches **no** condition at all: "Jede Nutzung ist
ohne Einschränkungen oder Bedingungen zulässig" (re-read 2026-10-06). We name the
publisher anyway, for the same reason as the CC0 feeds.

### DELFI e.V. — public-transport realtime · CC BY-SA (version unstated)

Germany-wide GTFS-RT Trip Updates — the live forecast behind the punctuality
figures — published by DELFI e.V. through the national access point
(Mobilithek), and listed on GovData under a Creative Commons
**Attribution-ShareAlike** licence.

```
Echtzeitdaten: DELFI e.V. via Mobilithek, CC BY-SA, bearbeitet
```

**The version is an open question, and this page will not invent one.** The
GovData catalogue record for this feed carries the *unversioned* licence URI
`http://dcat-ap.de/def/licenses/cc-by-sa` on its only resource (read 2026-09-27).
The dataset-level licence field is empty, which is **not** evidence of anything —
in DCAT-AP.de the licence lives on the distribution, and every record sampled from
this catalogue has it empty at dataset level, the versioned siblings included. The
resource field is the one that speaks. Per the dcat-ap.de vocabulary that is
a distinct term from `…/cc-by-sa/4.0`. It is not a habit of the publisher's
either: DELFI's sibling records *are* versioned — the Service Alerts record
carries `cc-by-sa/4.0` and the static timetable `cc-by/4.0` — so DELFI states a
version when it means one, and on this feed it did not.

The national access point's own metadata for this feed, read 2026-09-27, carries:

```
standardLicense         : http://dcat-ap.de/def/licenses/cc-by-sa
customLicenseAsResource : null
sourceNote              : null
```

So there is no versioned statement anywhere in the chain, and the attribution line
says exactly that: CC BY-SA, version unstated. Today's register links the same
unversioned term as the licence text.

Why it is not pedantry: art. 3(b)(1) of the 4.0 text sets the Adapter's Licence
to "the same License Elements, this version or later, or a BY-SA Compatible
License", so the version decides what a recipient may put on a derivative — and
3.0 unported has no express sui-generis-database-rights clause where 4.0 art. 4
does, which is exactly the derived-delay-table case. **Treat it as CC BY-SA and
assume the share-alike applies; do not rely on a specific version for a
derivative.** What you may do with it is set out
[at the top of this page](#public-transport-realtime-is-share-alike).

What it answers is a **region**, not a line: see the scope note in the README — no
tool here answers "is the S1 on time".

The **SIRI ET** rail realtime feed is in the same position — CC BY-SA, version
unstated, the same unversioned term in the register — and the same reading
applies:

```
Echtzeitdaten Schiene: DELFI e.V. via Mobilithek, Datensatz „DELFI-Realtime SIRI ET Bahndaten“, CC BY-SA, bearbeitet
```

The two **disruption feeds** state their version, 4.0, and are share-alike all
the same:

```
Störungsmeldungen: DELFI e.V. via Mobilithek, Datensatz „DELFI-Datensatz GTFS-RT Service Alerts“, CC BY-SA 4.0, bearbeitet
Störungsmeldungen: DELFI e.V. via Mobilithek, Datensatz „DELFI-Datensatz SIRI SX“, CC BY-SA 4.0, bearbeitet
```

GTFS-RT Service Alerts is the primary alert source: a SIRI SX alert with the same
headline and start, or the same message number, is not shown twice.

The **static timetable** and the **stop directory** are CC BY 4.0, not
share-alike; both answer today (`get_departures` reads the timetable, and the stop
directory resolves stop names for it and for the place lookups):

```
Fahrplandaten: DELFI e.V., CC BY 4.0, bearbeitet
Haltestellendaten: DELFI e.V. (zentrales Haltestellenverzeichnis), CC BY 4.0, bearbeitet
```

**Berlin and Brandenburg** punctuality comes from VBB's own realtime feed, which
VBB publishes under CC BY 4.0 ("It is licensed as CC-BY 4.0", the feed's own page,
read 2026-10-06). A Berlin or Brandenburg answer therefore carries no share-alike,
and DELFI remains the source for the rest of Germany:

```
Echtzeitdaten: VBB Verkehrsverbund Berlin-Brandenburg GmbH, CC BY 4.0, bearbeitet
```

Licence family: Creative Commons Attribution-ShareAlike — for the two unversioned
feeds no version URL is given here on purpose. The 4.0 text, for reference and
for the two alert feeds: <https://creativecommons.org/licenses/by-sa/4.0/> ·
publisher: <https://www.opendata-oepnv.de>

### Tankerkönig / MTS-K — fuel prices · CC BY 4.0 **plus a purpose limit**

```
Tankstellenpreise: Tankerkönig.de — MTS-K, CC BY 4.0, bearbeitet
```

Tankerkönig states the licence and the attribution in one sentence (read
2026-10-06): *"Die Daten stehen unter der Creative-Commons-Lizenz "CC BY 4.0" …,
insbesondere ist eine Namensnennung nötig (z.B. ein Link auf
www.tankerkoenig.de)"*. The link is the publisher's example of how to name it,
and we treat it as required: the line the server emits always carries
<https://creativecommons.tankerkoenig.de>, and a copy of the line should too.
(This page said until 2026-10-06 that the publisher made the link itself the
obligation; its sentence gives it as an example.)

The CC BY licence is **not** the binding constraint here. The MTS-K purpose
limitation sits on top of it and is stricter: consumer information only, and
never the fuel industry or its IT providers; our own condition adds no
redistribution. The full statement is
[at the top of this page](#fuel-prices-are-consumer-information-only), and every
fuel answer that lists a price carries it as a sentence of its own, to show
beside the price — 133 of the round's 140 fuel answers did, and the other seven
listed no price (they asked which place was meant). Tankerkönig's terms are blunt about bulk use: attempts to pull
the data in bulk "werden geblockt (und API-Keys deaktiviert)".

Terms: <https://creativecommons.tankerkoenig.de> · MTS-K guidance for consumer
services: <https://www.bundeskartellamt.de>

The historical price archive published beside the API is licensed
**CC BY-NC-SA** — non-commercial. It is not a source for any answer this
service gives, and it never will be while that licence stands.

### Deutsche Bahn AG — timetables, stations, facilities, station car parks

**Four** products on the DB API Marketplace, each read at its own product page,
and they do **not** share one licence. The three we serve are CC BY 4.0:

```
Fahrplandaten: Deutsche Bahn AG, DB API Marketplace, CC BY 4.0, bearbeitet
Bahnhofsdaten: Deutsche Bahn AG, DB API Marketplace, CC BY 4.0, bearbeitet
Aufzüge und Fahrtreppen: Deutsche Bahn AG, DB API Marketplace, CC BY 4.0, bearbeitet
```

The fourth, station car parks, is `read`: its licence has been read and nothing
is ingested. It is under **Datenlizenz Deutschland – Namensnennung – Version
2.0**, a different licence with a different line, printed here so that nobody has
to go and find it on the day it answers — do not assume the CC BY 4.0 line above
covers it:

```
Parking Information Daten der DB BahnPark – API über den DB API Marketplace
```

The product pages say it in one sentence (re-read 2026-10-06 on the timetable
product): *"Dieser Datensatz wird bereitgestellt unter der Lizenz Creative Commons
Attribution 4.0 International (CC BY 4.0)."* DB adds one carve-out, and it is
narrower than it looks: once the data has become part of OpenStreetMap, "genügt
eine Nennung der Deutschen Bahn AG in der Liste der Beitragenden". That is a
relaxation **for OSM**, not permission to drop the line from your own results.

**Lifts and escalators** now come mostly from DB InfraGO's OpenStation feeds on
the national access point — the inventory (NeTEx) and the live status (SIRI FM),
both **CC0 1.0** — which 29 answers named in the round, against 2 for the FaSta
product above. In Köln, the Kölner Verkehrs-Betriebe publish their own lift data
under Datenlizenz Deutschland – Zero 2.0, with one condition the register carries:
"Kölner Verkehrs-Betriebe AG provides the data without any warranty" — KVB's open
data page says the same ("Die KVB stellt Daten und sonstige Inhalte ohne jede
Gewähr bereit"). The lookup still depends on the station directory, so a station
missing from it produces "I cannot resolve that station" rather than an empty
facility list — the distinction matters if you are deciding whether to retry.

Publisher: <https://developers.deutschebahn.com>

### Deutscher Wetterdienst — official weather warnings · CC BY 4.0

```
Quelle: Deutscher Wetterdienst
```

The DWD's copyright page, re-read 2026-10-06: *"Alle frei zugänglichen Geodaten
und Geodatendienste sowie die als hochwertige Datensätze / high value datasets
(HVD) festgelegten Leistungen des DWD dürfen unter den Bedingungen der Lizenz
Creative Commons BY 4.0 (CC BY 4.0) unter Beigabe eines Quellenvermerks
weiterverwendet werden."*

§ 7 DWD-Gesetz — headed *Quellenschutz* — makes the source note a legal **duty**:
distribution of DWD data, products and special services, warnings in particular,
"ist nur unter Angabe der Quelle zulässig". Its second sentence leaves fuller
protection under the Urheberrechtsgesetz untouched, so attribution is the
statute's minimum and not necessarily the whole of what is owed. It prescribes no
wording at all. The **wording** is set by the DWD itself, in *Vorgaben für die
Gestaltung des DWD-Quellenvermerks*: either the text form `Quelle: Deutscher
Wetterdienst` or the DWD logo, placed "unmittelbar an der verwendeten
DWD-Information". Reproduce the text form as it stands, immediately next to the
DWD information it belongs to.

There is a second line, and the difference matters:

```
Datenbasis: Deutscher Wetterdienst, zusammengefasst
```

An **amtliche Wetterwarnung** is official text. Where an answer reproduces the
warning as issued, it carries `Quelle: Deutscher Wetterdienst`. Where it shows
our summary instead of the DWD's own words, the DWD requires the Quellenvermerk
to be **removed** and a changed-data note put in its place — an altered warning
must not look official. That is why you will see one line or the other and never
both (a summary answer for Garmisch-Partenkirchen carried the second line,
2026-10-06). If you rewrite a warning further, the same rule applies to you.

Licence: <https://www.dwd.de/copyright>

### Charging data — CC BY 4.0, CC0 1.0 and dl-de/by-2-0

Charge points reach us from three kinds of publisher, and the licences are **not
uniform**, so they are listed one by one in the table: the AFIR publications of
individual operators and platforms on the national access point (Eco-Movement,
EnBW, Tesla, Volkswagen, e-clearing.net), the Bundesnetzagentur's
Ladesäulenregister, and two operators' data passed on by MobiData BW.

**The licence follows the publisher, not the kind of data.** This page used to say
that static master data was CC BY 4.0 and live availability CC0. The register
shows otherwise: Tesla's and Volkswagen's master data are CC0, and EnBW's and
Eco-Movement's availability feeds are CC BY 4.0. Each offer gets its licence read
before it is used, and the line on the answer is the one to follow.

- **Bundesnetzagentur** asks for a specific name: *"Als Namensnennung für Daten
  dieser Internetseite ist Bundesnetzagentur.de zu verwenden"* (read 2026-10-06),
  and the line uses exactly that:
  `Ladesäulenregister: Bundesnetzagentur.de, CC BY 4.0, bearbeitet`.
- **chargecloud and Taubert Consulting** come through MobiData BW, which publishes
  the dataset under dl-de/by-2-0 (read 2026-10-06); the register records the
  operators' own data as CC0 1.0 and names both in the line, with the
  dl-de/by-2-0 note of change.

CC0 waives copyright and database rights and attaches **no** condition; we name
those publishers anyway, because an answer should say where it came from. CC0
does not waive trade marks: a name there identifies the source of the data and
nothing else.

Master data — where the posts are, which plug, how many kW — answers today.
**Live availability does not exist for most of Germany**, because only some
operators publish it. A result marks every such site `keine Statusdaten` and
closes with a sentence saying that this means unknown and not free — measured on
2026-09-27, asking for Leipzig. It refuses to leave such sites out or to call
them free, which is the part that matters when you act on the answer.

### OpenStreetMap — addresses and points of interest · ODbL 1.0

```
OSM-Standortdaten: © OpenStreetMap-Mitwirkende, ODbL 1.0
```

**Reproduce that line, not a shorter one.** This page printed
`Geokodierung: …` until 2026-09-27 and no answer has carried that prefix since the
release in which `find_poi` and `find_address` began returning an OSM row **as**
the answer — a name, a brand, a door — rather than only a coordinate resolved from
one. If you copied the old string, change it.

**Which answers carry it**, in the platform's own words — verbatim, with the
qualifier emphasised here because it is the part two earlier versions of this
page dropped: *"Only results whose input resolved through one of these two OSM
tables carry this line. A result about a place **from our own gazetteer**, a
station or a motorway is not built from OpenStreetMap and carries neither the
ODbL attribution nor the obligation."*

Read the qualifier. The predicate is **which table answered**, and it is not a
list of tools. Place resolution falls through the gazetteer to the OSM tables, so
a tool that takes a `place` returns an OSM-derived answer whenever the gazetteer
did not know the name — in the 2026-10-06 round that happened in eight tools, from
weather warnings to car parks. Measured on 2026-09-27: a weather warning for
`Zeiss-Großplanetarium` named `["dwd","osm"]` and carried this line; one for
`Allianz Arena` named `["osm"]` alone.

The positive test is the one to rely on: **read `_meta.sources` and the attribution
line on the answer you actually got.** Do not infer either from the shape of your
question.

Address data is imported **per deployment**, and the public service has it.
How complete that import is was measured on 2026-09-27 from the service's own
per-Land verdict — which reads both tables, names any missing Land and fails on
one — rather than extrapolated from a single lookup: **all sixteen Länder were
imported, and every row is scoped to the Land it came from**, over OSM data dated
2026-09-22. No row count is written here on purpose: it would be true the day it
was typed and stale at the next import. One caveat — **a single address that does
not resolve says nothing about its Land**: a market-square house number in Erfurt
came back unfound from a Land that is fully imported, because that address is not
in OpenStreetMap under the spelling it was asked for.

A deployment that has not imported the extract answers that it can find places,
stations and motorways but not house numbers, which is the right answer rather
than a guessed coordinate. There, neither this line nor the obligation arises,
because no OSM-derived answer is produced.

Our ODbL § 4.6 offer is [above](#and-one-that-applies-if-you-get-an-openstreetmap-derived-result-back).

Licence: <https://opendatacommons.org/licenses/odbl/1-0/> ·
copyright: <https://www.openstreetmap.org/copyright>

### BKG — administrative units · dl-de/by-2-0

The Bundesamt für Kartographie und Geodäsie publishes GN250 ("Geographische
Namen 1:250 000") free of charge under **Datenlizenz Deutschland –
Namensnennung 2.0**. Openness at the BKG is decided **per product**, so this
covers that one file and nothing else in their catalogue. It is the gazetteer
most place questions are resolved through, which is why 494 answers in the round
named it.

The source note is printed on the product's own terms, character for character,
and must be reproduced with the year of the last download filled in — plus a
note that the data was changed, which dl-de/by-2-0 requires and which we owe
twice over, because we keep a fraction of the rows and reproject every point:

```
Verwaltungseinheiten: © BKG (Jahr des letzten Datenbezugs) dl-de/by-2-0, Datenquellen: https://sgx.geodatenzentrum.de/web_public/gdz/datenquellen/datenquellen_gn250.pdf (Daten verändert)
```

Licence: <https://www.govdata.de/dl-de/by-2-0> ·
product: <https://gdz.bkg.bund.de>

### GeoNames — place gazetteer · CC BY 4.0

```
Ortsdaten: © GeoNames (CC BY 4.0), bearbeitet
```

*"This work is licensed under a Creative Commons Attribution 4.0 License"* —
the project's own statement, re-checked 2026-10-06. Places and administrative
units, with multilingual alternate names; **no streets and no house numbers**,
so it can never answer an address question.

This is what turns "Munich" or "Kreis Fulda" into the coordinates the other
sources are queried with, which is why the line turns up under answers that are
otherwise about weather, fuel or charging: the place came from here.

Licence: <https://www.geonames.org>

### Parking — many publishers · six licences

The licences are **not uniform** — DL-DE Zero, dl-de/by-2-0, CC BY 4.0, GeoNutzV,
CC BY-SA and ODbL all occur — so each source has its own row in the table, and
each answer carries the line of every publisher it lists.

- **Köln** is DL-DE/Zero-2.0, which attaches no condition; it is named anyway.
- **NRW car parks, Christophorus Parking, Hamburg and Münster** are
  dl-de/by-2-0, which needs the source note and a note that the data was
  changed — both are in their lines.
- **Bosch** is CC BY 4.0, with the `bearbeitet` the other CC BY sources carry.
- **The motorway lorry-parking file** is GeoNutzV; its line is in the roads block
  above.
- **P+R NRW** is CC BY-SA with no version stated, and **Trucklounge Ecopark** is
  ODbL 1.0. Both are share-alike, both come back in a list of their own, and what
  that means for you is [near the top of this page](#and-two-parking-sources-that-are-share-alike).

A missing "free now" in an answer means the operator publishes no count for that
site, not that it is full — the tool's own description says so.

### Bike sharing — CC0 1.0

`find_sharing` answers from nextbike's and Donkey Republic's public GBFS feeds,
both CC0 1.0 (nextbike's feed declares `CC0-1.0` itself, read 2026-10-06). No
condition attaches; the publishers are named anyway.

### German road rules — our own text

```
Verkehrsregeln: ViaFrei, eigene Zusammenstellung aus amtlichen Quellen (StVO, StVZO, 35. BImSchV, StVG, EmoG, AFIR); jede Aussage mit Quelle und Prüfdatum — informativ, keine Rechtsberatung
```

Environmental zones, tolls, equipment duties and charging rules are not a feed —
they are a compilation we write ourselves from the statutes, EU law, the
Umweltbundesamt's own lists and the Court of Justice. German statutes are
amtliche Werke and free of copyright; we summarise rather than reproduce, so no
provider licence attaches and we claim none. What every statement does carry is
its official source and the date it was last read, and a statement that lacks
either fails our build rather than reaching you.

It is information, never legal advice.

The watch tools name a source of their own, `viafrei_watch`, which carries no
provider data: every report a watch makes names the source of the data that
triggered it.

## What we deliberately do not use

Leaving a dataset out is as much a part of "we use all legal ways" as using one:

- **Two motorway datasets on the national access point** are published as
  "restricted use, free of charge" with **no terms behind the label** — one
  attaches a technical document by a different authority, the other attaches
  nothing. No readable terms means no grant to interpret, so nothing is served
  from them, no attribution line for them exists, and a road answer names them
  only to say they were not consulted.
- **Eight of the nine DB RIS products** publish no licence at all; their terms
  arrive as a contract after screening. They are not used, and the server
  cannot even name them.
- **The Tankerkönig historical archive** is CC BY-**NC**-SA. Non-commercial is
  incompatible with a commercial service, so it is not in any answer path.

## How this page is kept honest

- The attribution lines live **in the server**, not in this document. Every tool
  result carries the one that belongs to the data that answered it, and the
  register at `viafrei://attribution` is generated from the same place. A line
  that existed only in documentation would be a line nobody emits.
- Every row in our internal register records the licence, the operative sentence,
  the date it was read and who may do what with the data. Rows are re-verified
  **quarterly** and whenever a provider announces a change.
- The dates in this page are the dates the relevant page was read, not the dates
  it was written.
- **The statuses are measured, not declared**: on 2026-10-06, from 1,081 answers,
  by reading which sources each answer named. That is why **thirteen** rows say a
  source is held but not confirmed by an answer: held is not live, and a page that
  blurred the two would be the one thing this page exists not to be. The number
  is written here because it is small enough to count; if it stops matching the
  table, the table is right.
- Where a source's terms are unknown or unreadable, this page says so instead of
  rounding it up to "open data" — the motorway interface and the two "Open Data
  (freie Nutzung)" message feeds above are named on every answer for exactly that
  reason, and the datasets in the section before this one are left alone
  entirely.

Found something wrong here — a licence that changed, a line that is no longer
what the provider asks for? Open an issue. Getting this right matters more to us
than getting it quickly.
