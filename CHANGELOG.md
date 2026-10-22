# Changelog

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

