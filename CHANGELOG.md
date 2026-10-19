# Changelog

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

