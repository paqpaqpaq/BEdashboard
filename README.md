# Balansenergie All-in

Voegt all-in stroomprijzen, voorlopige dagresultaten, prognoses en aanvullende financiële overzichten toe aan het Balansenergie-dashboard.

## Downloads — nieuwste versie 4.7.1

| Variant | Download |
| --- | --- |
| Userscript voor Safari/Userscripts en Chrome/Edge/Tampermonkey | [Balansenergie-All-in-v4.7.1.user.js](https://github.com/paqpaqpaq/BEdashboard/raw/refs/heads/main/Balansenergie-All-in-v4.7.1.user.js) |
| Uitgepakte Chrome/Edge-extensie | [BE_dashboard_4_7_1.zip](https://github.com/paqpaqpaq/BEdashboard/raw/refs/heads/main/BE_dashboard_4_7_1.zip) |

[Release v4.7.1 met beide downloads](https://github.com/paqpaqpaq/BEdashboard/releases/tag/v4.7.1). De vaste userscript-installatie- en update-URL hieronder blijven beschikbaar voor automatische updates. Oudere zipbestanden in de repository zijn historische versies.

## Installeren als userscript — aanbevolen

Dit werkt met **Tampermonkey** in Chrome/Edge en met **Userscripts** in Safari op macOS, iOS en iPadOS.

1. Open [`Balansenergie-All-in.user.js`](https://raw.githubusercontent.com/paqpaqpaq/BEdashboard/main/Balansenergie-All-in.user.js).
2. Kies installeren in Tampermonkey of Userscripts.
3. Schakel een oudere, los geïnstalleerde versie uit om dubbele uitvoering te voorkomen.

De userscriptmanager kan nieuwe versies automatisch ophalen. De geïnstalleerde versie controleert daarvoor [`Balansenergie-All-in.meta.js`](https://raw.githubusercontent.com/paqpaqpaq/BEdashboard/main/Balansenergie-All-in.meta.js). Of en hoe vaak dat gebeurt, hangt af van de update-instellingen van de gebruikte userscriptmanager.

Bij installatie over een lokale testversie 4.7.x: open de RAW-installatielink en vervang handmatig. Automatische updates installeren doorgaans geen lager versienummer.

## Installeren als Chrome-extensie — v4.7.1

1. Download [BE_dashboard_4_7_1.zip](https://github.com/paqpaqpaq/BEdashboard/raw/refs/heads/main/BE_dashboard_4_7_1.zip).
2. Pak het ZIP-bestand uit.
3. Open `chrome://extensions`.
4. Schakel **Ontwikkelaarsmodus** in.
5. Kies **Uitgepakte extensie laden** en selecteer de uitgepakte map.

Bij een bestaande installatie: pak de nieuwe zip uit, vervang de bestanden in de geladen extensiemap en klik op **Opnieuw laden** bij de extensie. Herlaad daarna het dashboard.

Een handmatig geladen Chrome-extensie werkt, maar wordt op Windows en macOS niet automatisch vanaf GitHub bijgewerkt. Gebruik Tampermonkey als automatische updates gewenst zijn.

## Nieuwe versie publiceren

1. Verhoog `@version` in `Balansenergie-All-in.user.js` en `Balansenergie-All-in.meta.js`.
2. Vervang beide vaste bestanden op de `main`-branch.
3. Werk `src/dashboard.js` bij en bouw de Chrome-extensie-zip met hetzelfde versienummer in `manifest.json`.
4. Werk de versiegebonden userscriptdownload, alle actuele README-downloadlinks en de GitHub-release met beide varianten bij.

Laat de bestandsnamen van de twee userscriptbestanden gelijk; de vaste URL's maken de updatecontrole mogelijk.

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

## EPEX-prijsbron

Energy-Charts / Bundesnetzagentur / SMARD.de, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Bron: [Energy-Charts API](https://www.energy-charts.info/api.html). De bronvermelding staat ook onder het ⓘ bij EPEX. Schakel de oudere losse BE EPEX Day-ahead-plugin uit wanneer je de ingebouwde EPEX-functie gebruikt.
