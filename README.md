# Balansenergie All-in

Financieel overzicht, aanvullende prijzen en een eigen SOC-berekening voor het Balansenergie-dashboard.

## Download — versie 6.8.3.4 (stabiel)

- **[Userscript installeren](https://raw.githubusercontent.com/paqpaqpaq/BEdashboard/main/Balansenergie-All-in.user.js)** — Safari/Userscripts of Chrome/Edge/Tampermonkey.
- **[Chrome/Edge-extensie downloaden](https://github.com/paqpaqpaq/BEdashboard/raw/main/BE_dashboard_6_8_3_4.zip)** — uitpakken en via `chrome://extensions` → Ontwikkelaarsmodus → Uitgepakte extensie laden.
- **[Tekstversie om te plakken](https://github.com/paqpaqpaq/BEdashboard/raw/main/Balansenergie-All-in-v6.8.3.4.txt)** · [Wijzigingen](CHANGELOG.md).

Vervang de bestaande versie en herlaad het dashboard. Gebruik één hoofdvariant tegelijk: schakel de versie 6-beta en losse SOC-, BID-, EPEX- en break-even-plugins uit wanneer je deze versie installeert. De beta gebruikt een apart installatiekanaal en wordt daardoor niet automatisch vervangen door de stabiele versie. Bestaande instellingen en lokaal bewaarde historie blijven behouden in dezelfde browser en voor dezelfde installatie.

Gebruik bij een userscript de functie **Bijwerken** op je bestaande installatie. De vaste scriptnaam en sleutelopslag blijven behouden. Een bestaande TenneT-sleutel krijgt automatisch een lokale herstelkopie in dezelfde browser; een nieuwe sleutel aanmaken is voor een update niet nodig. Bij verbindingsproblemen staan onder **Details · marktgegevens en verbinding → Verbindingsinfo & aanvraaglimieten** de managernaam, versie en eventuele netwerkfoutdetails. Deel je API-sleutel niet bij een foutmelding.

## Onbalansprijzen sinds 6.8 — toestemming voor services.tenergy.nl

Balans levert sinds 18 november geen volledige onbalansprijzen meer. Versie 6.8 haalt ze zelf op: via Tenergy (actuele onbalansprijzen; per kwartier bepaald volgens de regeltoestand, ~1–2 minuten na het kwartier vastgesteld). Dit is een indicatie: de prijs die Balans zelf registreert gaat altijd voor. Daarvoor is één nieuwe netwerktoestemming nodig: **services.tenergy.nl**.

**Tampermonkey (Chrome, Edge, Firefox)**
1. De update komt vanzelf; sneller via Tampermonkey-menu → *Hulpprogramma's* → *Controleren op updates van userscripts*.
2. Open het Balans-dashboard. Tampermonkey vraagt of het script **services.tenergy.nl** mag benaderen: kies **Altijd toestaan** (domein).
3. Per ongeluk geweigerd? Tampermonkey-dashboard → script *Balansenergie All-in* → tabblad **Instellingen** → bij *XHR-beveiliging* `services.tenergy.nl` toevoegen aan de witte lijst (en uit de zwarte lijst halen). Opslaan en het dashboard herladen.

**Chrome-/Edge-extensie (zip)**
1. Download [BE_dashboard_6_8_3_4.zip](https://github.com/paqpaqpaq/BEdashboard/raw/main/BE_dashboard_6_8_3_4.zip) en pak uit over je bestaande extensiemap (of in een nieuwe map).
2. Ga naar `chrome://extensions` (of `edge://extensions`) en klik bij *Balansenergie All-in* op **Herladen**. Nieuwe map? Dan **Uitgepakte extensie laden** en de oude verwijderen.
3. Controleer onder **Details → Sitetoegang** dat **Op alle vermelde sites** is gekozen.

**Safari (Userscripts-app)**
1. Werk het script bij of installeer het opnieuw via de userscript-link hierboven.
2. Komen er geen prijzen? Safari → *Instellingen* → *Extensies* → **Userscripts** → ook **services.tenergy.nl** toestaan (of *Altijd toestaan op elke website*).

**Controleren:** typ in de browserconsole op het dashboard `BETenergy.status()`. Bij `kwartieren` hoort een getal boven 0 te staan en bij `fout` niets.

Je eigen BIDs zijn alleen nog live te zien, in de eerste minuten van een kwartier en met het dashboard open; achteraf ophalen kan niet meer.

## Wat verandert er van 5 naar 6?

- **Een eigen Financieel-scherm:** maandstaat, stroomresultaten, gemiddelde import- en exporttarieven, voorschotten, vaste kosten, belastingen en saldo bij elkaar. Kies een maand, contractjaar of eigen periode en bekijk de prognose voor de resterende contractperiode. Het oorspronkelijke BE-resultatenscherm blijft beschikbaar.
- **EPEX in de forecast:** kwartierprijzen in de SOC-forecastgrafiek, met een eigen schakelaar in de legenda en prijsinformatie in de gezamenlijke tooltip.
- **Dagtotalen bij het vermogen:** in Actueel staat bij net, batterij, verbruik en PV-opwek ook het dagtotaal in kWh. `~` betekent dat een deel van de meetgegevens ontbreekt.
- **Day-ahead verwerken:** geplande importkwartieren gebruiken de dynamische prijs van Balans, of de aangeleverde combinatie met aFRR. De lopende telling en voorlopige dagcache bewaren deze marktkeuze ook na herladen. Ontbrekende planning of prijzen blijven ongeprijsd; beschikbare Balans-dagbedragen hebben altijd voorrang in Financieel.
- **Coulombtelling in/uit:** een onafhankelijke blauwe SOC-lijn in Actueel en Forecast, berekend uit het accuvermogen op het BE-dashboard. Met bewaarde historie, handmatig herijken en automatische ijking rond 10% en 95%. De forecast blijft binnen 5–100%. De chemische inhoud en kWh in SOC-tooltips zijn met `~` gemarkeerde schattingen op basis van de spanningscurve; ze blijven afhankelijk van de SOC-telling. De vooruitblik volgt de verwachte SOC-beweging van Balans SOC p50, inclusief geplande im- en export, vanaf de eigen actuele SOC. Dit is een prognose; bij ontbrekende p50-bron blijft de PV-/verbruiksraming beschikbaar.
- **Zelf de accucapaciteit bepalen:** vul kWh in, of gebruik gemiddelde FCC in Ah (maximaal 330 Ah per accu) en het aantal accu’s. De Coulombtelling gebruikt een gemeten spanningsprofiel. De capaciteit uit Account wordt niet automatisch overgenomen.
- **BID-historie bewaren:** waargenomen biedingen blijven lokaal beschikbaar na herladen. Beschikbare gemiste biedingen worden teruggezocht; herkenbare historische prijsgrenzen kunnen ontbrekende lijnen aanvullen als onzekere reconstructie. Die krijgen `~` en uitleg in de tooltip. Rechtstreeks waargenomen BIDs hebben voorrang; niet ieder gemist bod is terug te halen. De aFRR BID-schakelaar verbergt alleen de lijnen, terwijl het verzamelen doorgaat zolang de browser uitvoering toestaat.
- **Verbeterd gebruik op smartphones:** het dashboardmenu blijft bereikbaar vanuit Financieel en grafieken herstellen bij openen, draaien en terugkeren naar de pagina. SOC-lijnen hebben een gezamenlijke tijdsaanduiding bij aanwijzen.

De bestaande functies uit versie 5 blijven beschikbaar, waaronder EPEX, break-even, darkmode, kwartier-CSV, EB/btw-keuze en voorschotwijzigingen per datum. De blauwe SOC-berekening gebruikt BE-data en werkt zonder een extern BMS-portaal.

### Vorige versie

[Versie 5.0 en bijbehorende downloads](https://github.com/paqpaqpaq/BEdashboard/releases/tag/v5.0) blijven beschikbaar als vorige versie. De vaste installatie- en update-URL volgen voortaan versie 6.

De getoonde resultaten zijn berekeningen, geen officiële afrekening. Ontbrekende brondata worden niet als nul ingevuld. Voorschotten zijn berekend op basis van je instellingen, geen gecontroleerd betalingsoverzicht.

[Changelog](CHANGELOG.md) · [Probleem melden](https://github.com/paqpaqpaq/BEdashboard/issues)

EPEX-bron: [Nord Pool](https://data.nordpoolgroup.com/auction/day-ahead/prices?deliveryAreas=NL&currency=EUR). Userscript-updates gebruiken de vaste installatie-URL; de uitgepakte Chrome/Edge-extensie werk je handmatig bij.
