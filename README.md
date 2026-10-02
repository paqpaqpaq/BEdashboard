# Balansenergie All-in

Voegt all-in stroomprijzen, voorlopige dagresultaten, prognoses en aanvullende financiële overzichten toe aan het Balansenergie-dashboard.

## Installeren als userscript — aanbevolen

Dit werkt met **Tampermonkey** in Chrome/Edge en met **Userscripts** in Safari op macOS, iOS en iPadOS.

1. Open [`Balansenergie-All-in.user.js`](https://raw.githubusercontent.com/paqpaqpaq/BEdashboard/main/Balansenergie-All-in.user.js).
2. Kies installeren in Tampermonkey of Userscripts.
3. Schakel een oudere, los geïnstalleerde versie uit om dubbele uitvoering te voorkomen.

De userscriptmanager kan nieuwe versies automatisch ophalen. De geïnstalleerde versie controleert daarvoor [`Balansenergie-All-in.meta.js`](https://raw.githubusercontent.com/paqpaqpaq/BEdashboard/main/Balansenergie-All-in.meta.js). Of en hoe vaak dat gebeurt, hangt af van de update-instellingen van de gebruikte userscriptmanager.

Bij installatie over een lokale testversie 4.7.x: open de RAW-installatielink en vervang handmatig. Automatische updates installeren doorgaans geen lager versienummer.

## Installeren als Chrome-extensie — v4.6.5

1. Download [BE_dashboard_4_6_5.zip](https://github.com/paqpaqpaq/BEdashboard/raw/refs/heads/main/BE_dashboard_4_6_5.zip).
2. Pak het ZIP-bestand uit.
3. Open `chrome://extensions`.
4. Schakel **Ontwikkelaarsmodus** in.
5. Kies **Uitgepakte extensie laden** en selecteer de uitgepakte map.

Een handmatig geladen Chrome-extensie werkt, maar wordt op Windows en macOS niet automatisch vanaf GitHub bijgewerkt. Gebruik Tampermonkey als automatische updates gewenst zijn.

## Nieuwe versie publiceren

1. Verhoog `@version` in `Balansenergie-All-in.user.js` en `Balansenergie-All-in.meta.js`.
2. Vervang beide vaste bestanden op de `main`-branch.
3. Voeg eventueel een nieuwe versie-zip toe voor gebruikers van de uitgepakte Chrome-extensie.

Laat de bestandsnamen van de twee userscriptbestanden gelijk; de vaste URL's maken de updatecontrole mogelijk.

## Changelog — v4.6.6

- **Resultaten → All time** toont nu de volledige periode vanaf de eerste geregistreerde aansluitdag tot en met vandaag. De all-in-weergave kon hiervoor ten onrechte de laatst geladen maand tonen.
- Beschikbare voorlopige metingen na de laatste verwerkte dag worden toegevoegd, zonder definitieve dagen dubbel te tellen of ontbrekende metingen met prognoses aan te vullen. De aansluitdatum, verwerkingsdatum en ontbrekende of onvolledige dagen worden zichtbaar vermeld.
- De all-in-kaart en grafiek gebruiken dezelfde periode. Bij wisselen tussen Maand en All time kan een later ontvangen maandresultaat het All time-overzicht niet meer overschrijven.
- De volledige userscriptcode is weer leesbaar over ruim 14.000 regels. Alle actuele versieverwijzingen zijn bijgewerkt naar 4.6.6.
- Deze update is beschikbaar als userscript. De bestaande Chrome-extensie-zip blijft versie 4.6.5.

## Changelog — v4.6.5

- EPEX NL day-ahead is ingebouwd. De compacte schakelaar staat rechts boven de tariefgrafiek; de legenda staat links op dezelfde regel, uitgelijnd met de y-as.
- All-in past dezelfde btw en energiebelasting toe, plus eenmaal € 0,02 opslag inclusief btw. Uitgeschakeld toont EPEX de kale prijs.
- De EPEX-stand wordt onthouden. De openbare prijsbron wordt maximaal eens per kwartier opgehaald zolang EPEX aan staat en de pagina zichtbaar is.
- **Schakel de losse BE EPEX Day-ahead-plugin uit** bij deze upgrade. De hoofdplugin bevat deze functie nu zelf.
- De userscriptmanager kan toestemming vragen voor `api.energy-charts.info`. Alleen openbare marktprijzen worden opgevraagd, zonder accountcookie.
- Prijsbron: [Energy-Charts](https://www.energy-charts.info/api.html) / Bundesnetzagentur / SMARD.de, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). EUR/MWh wordt omgerekend naar EUR/kWh; All-in voegt bovenstaande toeslagen toe.
