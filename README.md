# Balansenergie All-in

Financieel overzicht, aanvullende prijzen en een eigen SOC-berekening voor het Balansenergie-dashboard.

## Download — versie 6 (6.1.3, stabiel)

- **[Userscript installeren](https://raw.githubusercontent.com/paqpaqpaq/BEdashboard/main/Balansenergie-All-in.user.js)** — Safari/Userscripts of Chrome/Edge/Tampermonkey.
- **[Chrome/Edge-extensie downloaden](https://github.com/paqpaqpaq/BEdashboard/releases/download/v6.1.3/BE_dashboard_6_1_3.zip)** — uitpakken en via `chrome://extensions` → Ontwikkelaarsmodus → Uitgepakte extensie laden.
- **[Tekstversie om te plakken](https://github.com/paqpaqpaq/BEdashboard/releases/download/v6.1.3/Balansenergie-All-in-v6.1.3.txt)** · [Alle downloads](https://github.com/paqpaqpaq/BEdashboard/releases/tag/v6.1.3).

Vervang de bestaande versie en herlaad het dashboard. Gebruik één hoofdvariant tegelijk: schakel de versie 6-beta en losse SOC-, BID-, EPEX- en break-even-plugins uit wanneer je deze versie installeert. De beta gebruikt een apart installatiekanaal en wordt daardoor niet automatisch vervangen door de stabiele versie. Bestaande instellingen en lokaal bewaarde historie blijven behouden in dezelfde browser en voor dezelfde installatie.

## Wat verandert er van 5 naar 6?

- **Een eigen Financieel-scherm:** maandstaat, stroomresultaten, gemiddelde import- en exporttarieven, voorschotten, vaste kosten, belastingen en saldo bij elkaar. Kies een maand, contractjaar of eigen periode en bekijk de prognose voor de resterende contractperiode. Het oorspronkelijke BE-resultatenscherm blijft beschikbaar.
- **Coulombtelling in/uit:** een onafhankelijke blauwe SOC-lijn in Actueel en Forecast, berekend uit het accuvermogen op het BE-dashboard. Met bewaarde historie, handmatig herijken en automatische ijking rond 10% en 95%. De forecast blijft binnen 5–100%.
- **Zelf de accucapaciteit bepalen:** vul kWh in, of gebruik gemiddelde FCC in Ah, het aantal accu’s en de nominale spanning. De capaciteit uit Account wordt niet automatisch overgenomen.
- **BID-historie bewaren:** waargenomen biedingen blijven lokaal beschikbaar na herladen; beschikbare gemiste biedingen worden automatisch teruggezocht.
- **Verbeterd gebruik op smartphones:** het dashboardmenu blijft bereikbaar vanuit Financieel en grafieken herstellen bij openen, draaien en terugkeren naar de pagina. SOC-lijnen hebben een gezamenlijke tijdsaanduiding bij aanwijzen.

De bestaande functies uit versie 5 blijven beschikbaar, waaronder EPEX, break-even, darkmode, kwartier-CSV, EB/btw-keuze en voorschotwijzigingen per datum. De blauwe SOC-berekening gebruikt BE-data en werkt zonder een extern BMS-portaal.

### Vorige versie

[Versie 5.0 en bijbehorende downloads](https://github.com/paqpaqpaq/BEdashboard/releases/tag/v5.0) blijven beschikbaar als vorige versie. De vaste installatie- en update-URL volgen voortaan versie 6.

De getoonde resultaten zijn berekeningen, geen officiële afrekening. Ontbrekende brondata worden niet als nul ingevuld. Voorschotten zijn berekend op basis van je instellingen, geen gecontroleerd betalingsoverzicht.

[Changelog](CHANGELOG.md) · [Probleem melden](https://github.com/paqpaqpaq/BEdashboard/issues)

EPEX-bron: [EnergyZero Public API](https://docs.api.energyzero.nl/docs/api/swagger/public/energy-market-service-get-prices/). Userscript-updates gebruiken de vaste installatie-URL; de uitgepakte Chrome/Edge-extensie werk je handmatig bij.
