# Balansenergie All-in

Voegt all-in stroomprijzen, voorlopige dagresultaten, prognoses en aanvullende financiële overzichten toe aan het Balansenergie-dashboard.

## Installeren als userscript — aanbevolen

Dit werkt met **Tampermonkey** in Chrome/Edge en met **Userscripts** in Safari op macOS, iOS en iPadOS.

1. Open [`Balansenergie-All-in.user.js`](https://raw.githubusercontent.com/paqpaqpaq/BEdashboard/main/Balansenergie-All-in.user.js).
2. Kies installeren in Tampermonkey of Userscripts.
3. Schakel een oudere, los geïnstalleerde versie uit om dubbele uitvoering te voorkomen.

De userscriptmanager kan nieuwe versies automatisch ophalen. De geïnstalleerde versie controleert daarvoor [`Balansenergie-All-in.meta.js`](https://raw.githubusercontent.com/paqpaqpaq/BEdashboard/main/Balansenergie-All-in.meta.js). Of en hoe vaak dat gebeurt, hangt af van de update-instellingen van de gebruikte userscriptmanager.

## Installeren als Chrome-extensie

1. Download [BE_dashboard_4_6_3.zip](https://github.com/paqpaqpaq/BEdashboard/raw/refs/heads/main/BE_dashboard_4_6_3.zip).
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

## Huidige versie

**4.6.3**

- Dagtotalen gebruiken de fijnmazige historische vermogensmetingen waar beschikbaar; ontbrekende tarieven laten de gemeten kWh niet verdwijnen.
- Eerder opgeslagen eindige kwartierprijzen blijven apart bewaard als een nieuwe prijsresponse leeg is. Geldige nieuwe tarieven gaan voor; herstelde tarieven blijven voorlopig.
- Resultaat vandaag toont bedrag en import/export. Informatie over ontbrekende of herstelde tarieven staat in de tooltip.
- Deze uitgave bevat geen persoonlijke hersteldata; historische prijsgegevens worden uit het eigen browserarchief hersteld.

- Warm grafiet-darkmode via instellingen, met contrasterende navigatie, kaarten, schakelaars en herkenbare grafiekkleuren.
- Tariefgrafiek op Actueel met dezelfde tijdas en uitlijning als de vermogensgrafiek.
- Het lopende kwartier toont waargenomen tariefwijzigingen gestippeld; gesloten kwartieren worden bijgewerkt met latere broncorrecties.
- Prijsverversing iedere 15 seconden, hergebruik van gelijke aanvragen en een pauze na een rate-limitmelding.
- All-in op Resultaten onthoudt de gekozen stand. Tooltips zijn ingekort.
- Minder heropbouw van Resultaat vandaag en darkmode tijdens gegevensupdates.

Bij installatie over een lokale testversie 4.7.x: open de RAW-installatielink en vervang handmatig. Automatische updates installeren doorgaans geen lager versienummer.


- Voorlopige kosten en opbrengsten staan apart in het maandblok en tellen mee in Stroomkosten; definitieve dagen worden niet dubbel geteld.

- De contractbalk toont de echte verstreken kalenderdagen, het kalenderpercentage en de actuele positie binnen de contracttermijn.
- Het maandoverzicht toont onder **Stroomkosten** uitsluitend afname en teruglevering; netbeheer, voorschotten en de vaste belastingvermindering blijven erbuiten.
- **Rustâââgh** staat op Actueel standaard aan en kan rechts in de kopbalk van Live Status worden uitgeschakeld.
- De herkenning van Live Status gebruikt de inhoud van het dashboard in plaats van vaste pixelhoogtes, zodat Rustâââgh ook met Firefox-lettermetingen en zoom werkt.
- Live vermogenswaarden gebruiken tabulaire cijfers en een vaste breedte, terwijl de bestaande flipanimatie behouden blijft.
- Waarden rond het schema blijven gecentreerd; de waarden onder Laatste meting blijven rechts uitgelijnd.
- De tijdregel en het SOC-bolletje in de batterijtekening blijven onaangeroerd, zodat tekst en pictogram niet vervormen.
- Actueel vindt de installatie zelfstandig wanneer het dashboard op `/customer/` opent en bewaart voorlopige dagen voor vergelijking met definitieve resultaten.
