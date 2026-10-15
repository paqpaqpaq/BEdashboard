# Balansenergie All-in

Aanvullende prijzen en resultaten voor het Balansenergie-dashboard.

## Download — versie 5.0

- **[Userscript installeren](https://raw.githubusercontent.com/paqpaqpaq/BEdashboard/main/Balansenergie-All-in.user.js)** — Safari/Userscripts of Chrome/Edge/Tampermonkey.
- **[Chrome/Edge-extensie downloaden](https://github.com/paqpaqpaq/BEdashboard/releases/download/v5.0/BE_dashboard_5_0.zip)** — uitpakken en via `chrome://extensions` → Ontwikkelaarsmodus → Uitgepakte extensie laden.
- **[Tekstversie om te plakken](https://github.com/paqpaqpaq/BEdashboard/releases/download/v5.0/Balansenergie-All-in-v5.0.txt)** · [Alle downloads](https://github.com/paqpaqpaq/BEdashboard/releases/tag/v5.0).

Vervang de bestaande versie en herlaad het dashboard. Schakel losse BID-, EPEX- en break-even-plugins uit: deze functies zijn inbegrepen. Gebruik één hoofdvariant tegelijk. Een lokaal geïnstalleerde 5.0.x-testversie moet je handmatig vervangen door 5.0.

## Nieuw in 5.0

- **Kwartierdata downloaden:** kies onder Instellingen → Downloads een periode en download CSV, met voortgang en stopknop.
- **All-in zoals voorheen:** eigen totaal van verkoop minus inkoop, met de bijbehorende kosten en gemiddelde prijzen. De resultatentabel staat onder de salderingsbalans.
- **EB + btw uitschakelbaar:** standaard aan. Uitschakelen past de resultaatgrafiek en bijbehorende bedragen aan; € 0,02/kWh opslag bij inkoop en inhouding bij verkoop blijven staan. Het contractoverzicht behoudt zijn volledige belastingberekening.
- **Maandbedrag per ingangsdatum:** voorschotten worden vanaf die datum, inclusief die dag, naar rato van kalenderdagen berekend.


De getoonde resultaten zijn berekeningen, geen officiële afrekening. Ontbrekende brondata worden niet als nul ingevuld. Voorschotten zijn berekend op basis van je instellingen, geen gecontroleerd betalingsoverzicht.

[Changelog](CHANGELOG.md) · [Probleem melden](https://github.com/paqpaqpaq/BEdashboard/issues)

EPEX-bron: [EnergyZero Public API](https://docs.api.energyzero.nl/docs/api/swagger/public/energy-market-service-get-prices/). Userscript-updates gebruiken de vaste installatie-URL; de uitgepakte Chrome/Edge-extensie werk je handmatig bij.
