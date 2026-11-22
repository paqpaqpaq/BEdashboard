# Changelog

## 7.3 — 21 november 2026

- Afrekenprijs per kwartier zonder BE-prijs: officiële TenneT-verrekenprijs gaat voor, daarna eigen berekening uit de TenneT 12 s-reeks (regeltoestand, middenprijs in toestand 2, alleen complete kwartieren), daarna Tenergy.
- Tenergy-schatting verbeterd: minuut 2 van het volgende kwartier (de reeks loopt 3 minuten achter), hooguit 3 keer per kwartier opgehaald.
- Regeltoestand (−1, 0, 1, 2) per afgesloten kwartier onderaan de tariefgrafiek; vet = officieel, grijs = 12 s-berekening, licht = Tenergy.
- Officiële verrekenprijzen binnen de TenneT-limiet (25 per dag): hooguit elke 6 uur één aanvraag; ze verschijnen in de praktijk de volgende dag.

## 7.1 — 21 november 2026

- Fact(uur)checker: alleen voor de jaar- of eindafrekening (melding bij een termijnfactuur).
- Nota's met stroom én gas: gas apart getoond en intern nagerekend; vergelijking met regels en dashboard alleen voor stroom.
- Netbeheertarief van de nota (bijv. Liander) wordt herkend, met knop om het over te nemen in Financieel.
- Andere verdeling van de energiebelasting over de jaren wordt als toegestane methode getoond.
- Opvallende dagen: bij een maandverschil van meer dan € 5 toont de checker welke dashboarddagen eruit springen.

## 7.0 — 21 november 2026

- Fact(uur)checker toegevoegd: Balans-nota (pdf) inlezen, per post en per maand naast de regels en je dashboard, met verificatie.
- Aanpassingen verrekening belastingen en saldeermethodes: saldering naar herkomst (duurzaam volledig, overig tot 5.000 kWh), nieuwe EB-verdeling 'werkelijk verbruik per tariefperiode (zoals Balans)', invoervelden zonder stapfout.

## 6.8.3.4 — 21 november 2026

- Klein paars balkje bovenaan het dashboard als er op GitHub een nieuwere versie staat (Tampermonkey/Userscripts; vraagt één keer toegang tot raw.githubusercontent.com).

## 6.8.3.3 — 21 november 2026

- Netaansluiting-schema: toont meteen de bekende prijs (met paarse stekker) in plaats van eerst "Prijs niet beschikbaar" tot Balans' volgende ronde.

## 6.8.3.2 — 21 november 2026

- Ook bij de prijs in het schema (Netaansluiting) dezelfde paarse stekker als in de grafiek, in plaats van het 🔌-teken.

## 6.8.3.1 — 21 november 2026

- De ingevulde prijs (met stekker) staat na laden of zoomen meteen in de bovenste grafiek. Balans tekent tot zijn volgende ronde (~15–20 s) eerst "Import —"; als de plugin de prijs al heeft, wordt die direct getoond.
- Stekker bij liggende (ingezoomde) labels onder het label in plaats van eroverheen.

## 6.8.3 — 21 november 2026

- Ontbrekend dynamisch tarief aangevuld. Sinds 20 november geeft Balans voor ingeplande day-ahead-importkwartieren geen prijs meer (`day_ahead_import: null`). Alleen dán vult de plugin de openbare EPEX-prijs (Nord Pool, NL, kaal) in; een prijs van Balans zelf wordt nooit overschreven. Bij dynamisch + aFRR zonder gemengde prijs wordt ook met de EPEX-prijs gerekend. Zulke labels in de bovenste grafiek krijgen een paarse stekker; de onderste grafiek, Resultaat vandaag en Financieel rekenen met dezelfde prijs.
- Coulombtelling-lijn wordt niet meer elke seconde opnieuw opgebouwd (zuiniger geheugengebruik).
- Duidelijkere foutmelding als Tenergy niet bereikbaar is.

## 6.8.2 — 19 november 2026

- Geheugenlek opgelost. De Coulombtelling-lijn in de SOC-grafiek had een vaste `segment`-instelling. Daardoor vergeleek Chart.js bij elke update de stijl van alle punten (zo'n 14.000) als tekst; omdat Balans de grafiek elke seconde bijwerkt, ging dat om ~30.000 bewerkingen per seconde en liep het geheugen van het tabblad in een paar uur op tot meerdere GB. De lijn ziet er hetzelfde uit.
- Achteraf ophalen van gemiste BID's vraagt alleen nog de laatste 26 uur op. Balans weigert oudere bereiken sinds 17 november (HTTP 400); een geweigerde dag wordt niet meer elke 5 minuten opnieuw geprobeerd.

## 6.8.1 — 18 november 2026

- Kwartierprijs uit Tenergy volgens de regeltoestand in plaats van de laatste minuut. De plugin bewaart per minuut het geactiveerde op- en afregelvermogen uit de Tenergy-tabel: alleen afregelen → laagste prijs, alleen opregelen → hoogste prijs, beide (regeltoestand 2) → afnemen hoogste en invoeden laagste, geen activatie → laatste minuut. Bijvoorbeeld 18 nov 14:30: 5,79 €/MWh in plaats van een uitschieter van 99,59 in de laatste minuut. Afgesloten kwartieren worden met terugwerkende kracht herberekend zodra de activatiedata er is (minstens 10 van 15 minuten).
- Ophalen van officiële TenneT-verrekenprijzen verwijderd: TenneT publiceert die pas na meer dan een uur en de API-sleutel is begrensd op 25 verzoeken per dag.

## 6.8 — 18 november 2026

- Onbalansprijzen terug. Sinds 18 november 2026 levert Balans in `current-prices` alleen nog de prijs van kwartieren waarin de accu iets deed. De plugin vult ontbrekende afname- en invoedingsprijzen nu zelf aan:
  - **Tenergy** (publieke pagina, minuutwaarden): live-lijn van het lopende kwartier; de laatste minuut van een afgesloten kwartier staat ~1–2 min na afloop vast. Op 17-11 in 7 van 8 vergeleken kwartieren exact gelijk aan de Balans-prijs.
  - **TenneT settlement-prices** (eigen TenneT-sleutel): officiële prijs, overschrijft Tenergy en vult oudere gaten. Alleen voor kwartieren die echt ontbreken, binnen het bestaande dagbudget.
  - Rangorde: prijs van Balans zelf > TenneT > Tenergy. Gevulde kwartieren dragen `beOnbalansBron`.
- Cache van 60 dagen in de browser; bij een nieuw bezoek direct aangevuld, ook in het lokale archief.
- Nieuwe netwerktoegang: `services.tenergy.nl` (userscript `@connect`, extensie host-permission). Controle in de console: `BETenergy.status()`.

## 6.7.1 — 17 november 2026

- Regelvermogen & biedingen, blok Details: BID, afstand tot BID en aFRR op-/afregelprijs in €/kWh met drie decimalen (bijv. € 4,000 / kWh in plaats van € 4.000,00 / MWh), gelijk aan de samenvatting. De tabel met bronmetingen blijft in €/MWh.

## 6.7 — 16 november 2026

- Aanpassing eindafrekening berekening: energiebelasting, belastingvermindering en netbeheer per kalenderjaar, afgestemd op een Balans-jaarafrekening.
- EB 2025 € 0,10154, 2026 € 0,09161, 2027 € 0,08802 (voorlopig); vermindering 2025 € 524,95, 2026 € 519,80, 2027 € 519,58 (alle excl. btw).
- Netbeheer per jaar instelbaar; standaard Enexis t/m 3×25 A zoals Balans factureert: € 1,30390 (2025) en € 1,30365 (2026) per dag incl. btw. Vaste leveringskosten € 0,21839 per dag.
- Ook de stroomkosten, Voorschot & verrekening en de prognose gebruiken nu de jaartarieven in plaats van alleen het 2026-tarief.
- Melding in Financieel wanneer het saldeerplafond van 5.000 kWh teruglevering afkapt, met het geraamde bedrag.
- Lege jaarvelden overschrijven de standaardtarieven niet meer; oude standaarddagbedragen (1,3861 en 0,2184) worden automatisch vervangen.

## 6.6.9 — 8 november 2026

- De tariefgrafiek in Actueel toont de onbalansprijzen voor afname en invoeding ook tijdens geplande EPEX-kwartieren.
- De tooltip vermeldt de prijsbron en het toegepaste tarief.
- Ontbrekende onbalansprijzen voor afgeronde kwartieren komen waar beschikbaar van TenneT Settlement Prices.

## 6.6.8 — 8 november 2026

- Gepland volume en totaalbedrag per Day Ahead-reeks in Forecast.
- EPEX-prijzen en min/max in Forecast volgen de prijsstand in Financieel.
- Gepland EPEX-vermogen per kwartier in de Forecast-tooltip.

## 6.6.7 — 8 november 2026

- Gemiddelde tarieven per kWh naast de inkoop- en verkooptotalen in Financieel.

## 6.6.6 — 6 november 2026

- EPEX bron nordpool
- min max EPEX tarief in forecast grafierk

## 6.6.5 — 6 november 2026

- EPEX-kwartierprijzen in de forecastgrafiek

## 6.6.4 — 5 november 2026

- Prestatieverbeteringen zonder verlies van functionaliteit

## 6.6.3 — 4 november 2026

- Dagtotalen in kWh bij de vermogenskaarten
- Wit netvakje in de tooltip van Grafiet

## 6.6.2 — 2 november 2026

- Correctie all-in prijsweergave in Actueel
- Verbeterde tijdkoppeling forecast en verwerking prijscache

## 6.6.1 — 1 november 2026

- aanpassing Coulombtelling in forecast op basis van geplande im- of export
- statusmelding ontbrekende data

## 6.6 — 1 november 2026

- Aanpassing voor verrekening Day Ahead in resultaten

## 6.5 — 31 oktober 2026

- Aanpassing weergave Tennet regelvermogen
- Aanpassing BID weergave
- Aanpassing chemische inhoud

## 6.4.2 — 27 oktober 2026

- Aanpassing TenneT-verbinding en foutinformatie.
- Subtiele achtergrondmarkering vanaf 500 MW.

## 6.1.9 — 22 oktober 2026

- Duidelijkere schakelaars in dark mode, tijdelijke tariefcache en navigatie in Financieel.

## 6.1.8 — 22 oktober 2026

- visuele aanpassingen bids, en smartphone navigatie

## 6.1.7 — 21 oktober 2026

- Aanpassingen en keuze in dark mode

## 6.1.6 — 21 oktober 2026

- Visuele weergave fix in historie

## 6.1.5 — 21 oktober 2026

- kleine bugfix weergave

## 6.1.4 — 21 oktober 2026

- Dubbele legenda voor Coulombtelling in/uit verwijderd; de bestaande aan/uitknop blijft beschikbaar.

## 6.1.3 — 20 oktober 2026 — versie 6 stabiel

- Versie 6 vervangt versie 5 als stabiele hoofdversie; versie 5 blijft als vorige versie beschikbaar.
- Een eigen Financieel-scherm met maandstaat, contract- en perioderesultaten, gemiddelde kWh-tarieven, voorschotten, kosten en prognose.
- Onafhankelijke Coulombtelling in/uit op basis van BE-accuvermogen, zichtbaar in Actueel en Forecast, met bewaarde historie en handmatige of automatische herijking rond 10% en 95%.
- Handmatige accucapaciteit via kWh of gemiddelde FCC × aantal accu’s × nominale spanning.
- Lokaal bewaarde BID-historie en automatisch terugzoeken van beschikbare gemiste biedingen.
- Verbeterd mobiel gebruik, grafiekherstel en gezamenlijke SOC-tijdaanwijzing.
- Userscript, vaste update-URL en Chrome/Edge-ZIP gezamenlijk uitgebracht als stabiele versie 6.1.3.

## 6.1.2 BETA — 20 oktober 2026

- Keuze tussen handmatige kWh-capaciteit en gemiddelde FCC in Ah × aantal accu’s × nominale spanning, met directe voorvertoning van de rekencapaciteit.
- Geen automatische overname van Account-/forecastcapaciteit; bestaande handmatige instellingen blijven behouden.
- Capaciteitsvelden overzichtelijk uitgelijnd, met eenheden naast de waarden en een aangepaste indeling op smartphones.

## 6.1.1 BETA — 20 oktober 2026

- kWh in/uit in het SOC-overzicht worden getoond sinds het laatste ijkpunt; totalen over de bewaarde historie staan bij de details.
- Vanaf 95% volgt blauw de hoogste originele SOC en laat los zodra de coulombtelling daalt. De daling langs 95% herijkt niet opnieuw.

## 6.1 BETA — 20 oktober 2026

- Blauw volgt bij ontladen de laagste originele SOC rond en onder 10%, en telt vanaf dat ijkpunt zelfstandig verder zodra de coulombtelling stijgt. De stijging langs 10% herijkt niet opnieuw.
- Herijken op 95% en de doorlopende kWh-tellers blijven behouden.

## 6.0.7 BETA — 20 oktober 2026

- Onder 10% volgt de blauwe SOC-weergave de originele SOC; vanaf 10% omhoog hervat de eigen telling. De kWh-tellers blijven doorlopen.
- Mobiele SOC-opstart verbeterd voor dashboardadressen zonder afsluitende slash en later aangemaakte grafieken.

## 6.0.6 BETA — 20 oktober 2026

- Opstarten van de EPEX- en SOC-grafieken op smartphones verbeterd, inclusief herstel na verbergen, draaien en terugkeren naar de pagina.

## 6.0.5 BETA — 19 oktober 2026

- Coulombtelling: laatste geldige waarde blijft zichtbaar tijdens verversen en herladen. Verouderde metingen en bronfouten worden met het bijbehorende tijdstip vermeld.

## 6.0.4 BETA — 19 oktober 2026

- Coulombtelling in/uit toegevoegd aan Actueel en Forecast, met aan/uitknop en waarden bij de muisaanwijzer.
- Automatisch herijken bij 10% en 95% van de originele SOC; handmatig herijken blijft mogelijk.

## 6.0.3 BETA — 19 oktober 2026

- Op smartphones blijft de oorspronkelijke menubalk beschikbaar in Financieel. Het menu opent zonder eerst naar Actueel terug te gaan.

## 6.0.2 BETA — 19 oktober 2026

- Dashboardmenu op smartphones weer bereikbaar vanuit Financieel, ook na scrollen.
- Blauwe focusrand rond de titel Financieel verwijderd.

## 6.0.1 BETA — 19 oktober 2026

- Gemiddelde kWh-tarieven voor import en export toegevoegd aan het detailoverzicht.
- Smartphoneweergave verbeterd, inclusief de knop Financieel in het mobiele menu.

## 5.0 — 15 oktober 2026

- CSV-export van kwartierdata voor een gekozen periode via Instellingen → Downloads, met voortgang, wachttijd en gedeeltelijk opslaan bij stoppen.
- All-in-totaal weer berekend uit verkoop minus inkoop; grafiek, bedragen en gemiddelde prijzen volgen dezelfde belastingstand.
- EB + btw als schakelaar, standaard aan. Zonder belastingen blijft de opslag aan beide kanten behouden.
- Resultatentabel onder de salderingsbalans; in All-in-modus eigen resultaten in plaats van voordeel ten opzichte van een vast contract. All-in uit herstelt de BE-cijfers.
- Voorschotwijzigingen met ingangsdatum, inclusief die dag en naar rato van kalenderdagen.
- aFRR BID-info geïntegreerd; bestaande EPEX- en break-evenfuncties behouden. Geen Mijnbatterij-integratie.
- Userscript, updatebestand, tekstversie en Chrome/Edge-extensie gezamenlijk bijgewerkt naar 5.0.

## Changelog — v4.7.5

- Break-even volgt nu dezelfde bekende bedragen als **Resultaat vandaag**. Een ontbrekende kwartierprijs blokkeert niet langer alle latere markers.
- Nuldoorgangen worden ook tijdens het lopende kwartier getoond.
- Bij ontbrekende prijzen of een lopend kwartier verschijnt **Break even ≈**, met een korte toelichting dat het berekende resultaat voorlopig is. Ontbrekende meetdekking blijft de berekening onderbreken.
- Prijzen worden per werkelijk gebruikte stroomrichting verwerkt; een ontbrekende prijs voor de andere richting blokkeert het kwartierresultaat niet.

## Changelog — v4.7.4

- De tariefgrafiek markeert waar het cumulatieve dagresultaat van negatief naar positief gaat, of andersom. Ook meerdere omslagpunten per dag worden weergegeven.
- Paarse stippellijn over de volledige grafiekhoogte, met het verticale label **Break even**. Een groene **+** en rode **−** tonen de positieve en negatieve zijde.
- Volgt de keuze all-in / kaal. Het tijdstip wordt benaderd op basis van volledige kwartierresultaten; bij ontbrekende of voorlopige kwartieren worden latere omslagpunten niet getoond.
- Deze functie zit nu in beide hoofdvarianten. Schakel de losse break-even-testplugin uit na installatie en vernieuw het dashboard.

## Changelog — v4.7.3

- EPEX-prijsbron vervangen door de werkende EnergyZero Public API na uitval van Energy-Charts (HTTP 503).
- Nederlandse day-ahead-kwartierprijzen met expliciete begin- en eindtijden. De aanvraag gebruikt de datum in Europe/Amsterdam.
- Kale prijzen in EUR/kWh; btw, leverkosten en energiebelasting worden in de all-in weergave één keer toegevoegd.
- Aparte prijscache en bijgewerkte bronvermelding en netwerktoestemmingen voor Userscripts en Chrome/Edge.
- Lokaal getest en door de gebruiker bevestigd op het dashboard.

## Changelog — v4.7.2

- De lopende maand volgt weer de gewone afwisselende achtergrondkleur van de maandregels; de afwijkende paarse markering is verwijderd.
- Userscript, updatebestand en Chrome/Edge-download bijgewerkt naar 4.7.2.

## Changelog — v4.7.1

- De lange toelichting onder de maanddetails is verwijderd.
- Voorschotten worden naar rato toegerekend: **maandbedrag × meetellende dagen ÷ kalenderdagen van die maand**. De eerste en laatste gedeeltelijke maand tellen alleen hun contractdagen mee; de lopende maand telt tot en met vandaag.
- De voorschottenkaart, maandregels, saldi en jaarprognose gebruiken dezelfde toerekening. Vaste kosten blijven per contractdag berekend.
- Voorbeeld bij €20 per maand en start op 29 oktober: 29–31 oktober = €1,94; 1–28 oktober in het volgende jaar = €18,06. De dertien maandregels leveren samen €240 voorschot op.
- De getoonde voorschotten zijn een berekende toerekening, geen registratie van daadwerkelijke betalingen. Afronding gebeurt alleen bij de weergave.

## Changelog — v4.7

- Het lopende contractjaar schuift automatisch door op de jaardag. Het nieuwe overzicht begint met een eigen saldo; historische gegevens blijven behouden.
- De maandstaat bevat ook de laatste gedeeltelijke maand: dertien regels bij een start midden in de maand, twaalf bij een start op de eerste. Start- en einddatum staan klein onder de maandnaam, zonder extra rijhoogte. De oorspronkelijke balken en kleuren blijven behouden.
- Gedeeltelijke maanden gebruiken daggegevens binnen de contractgrenzen. Vaste kosten worden per contractdag berekend. Voorschotten blijven twaalf geschatte termijnen op de maandelijkse startdag, geen dertiende termijn.
- De prognose gebruikt vergelijkbare volledige maanden van het vorige jaar. Vanaf twee volledige maanden in het nieuwe jaar geldt **60% historie + 40% bijgewerkt seizoensprofiel**. Zonder bruikbare historie blijft de bestaande prognose de basis.
- De lopende maand vermeldt bijvoorbeeld **berekend t/m 2 oktober · 3 en 4 voorlopig**, met arcering voor het voorlopige deel.
- Compleet, leesbaar userscript en Chrome/Edge-extensie bijgewerkt naar **4.7**.

