# Health Connect Dashboard

Selbst gehostete, private Gesundheits-App für Daten aus **Google Health Connect**: Puls, Schlaf, Schritte, SpO₂, HRV, Gewicht und mehr. Dazu kommen manuell erfasste **pH-Werte**. Die Daten landen auf deinem eigenen Server in einer MariaDB, nicht in einer fremden Cloud. Ein modernes Webinterface im Dark Mode stellt sie dar.

Entstanden ist das Projekt für eine Huawei-Uhr, deren Daten ohne Zugang zur Huawei-Cloud ausgewertet werden sollten. Es funktioniert aber mit jeder Quelle, die nach Health Connect schreibt.

```
Uhr / Band ──► Hersteller-App ──► (z. B. Health Sync) ──► Google Health Connect
                                                                │
                                   Tasker  ◄────────────────────┤
                                   oder HC Bridge (eigene App) ◄┘
                                                                │
                         pH-Teststreifen ──► pH-Wert (eigene App)│
                                                                │  HTTP POST (JSON)
                                                                ▼
                         ┌────────────── Docker ──────────────────────────┐
                         │  Ingest :8321 ─► Rohdaten-Archiv ─► MariaDB    │
                         │  Webinterface :8322 (Svelte, ECharts, PWA)     │
                         └────────────────────────────────────────────────┘
```

## Funktionen

**Auswertung**
- **Heute**: Tagesüberblick mit Bewertungsringen, letzten Messwerten und Status der Datenquellen
- **Herz**: Puls (Ø, Min–Max), Ruhepuls mit Zielbereich, Belastungszonen, HRV
- **Schlaf**: Hypnogramm der Schlafphasen, Phasen pro Nacht, Kalender-Heatmap, Schlafbewertung
- **Aktivität**: Schritte mit Tagesziel, Distanz, aktive und Gesamtkalorien, Trainingseinheiten
- **Vitalwerte**: SpO₂, Atemfrequenz, Körpertemperatur, Blutdruck, Blutzucker
- **Körper**: Gewichtsverlauf, BMI, Körperfett
- **pH-Wert**: Verlauf mit Zielbereich, Werteverteilung, Messliste
- **Tagebuch**: Notizen und Tags pro Tag (krank, Alkohol, Sport, Stress …)
- **Analyse**: Zusammenhänge zwischen Messarten und der Einfluss von Tags

Messarten, für die keine Daten vorliegen, blendet die App aus. Sie erscheinen automatisch, sobald Health Connect sie liefert.

**Datenverwaltung**
- **Bearbeiten und Nachtragen** für jede Messart über den gesamten Zeitraum. Der Originalwert bleibt erhalten und lässt sich jederzeit wiederherstellen.
- **Eingaben werden immer angenommen**. Unplausible Werte lösen nur eine Warnung aus und lassen sich später von Hand korrigieren.
- **Protokoll** aller Änderungen mit Zeitpunkt und Gerät
- **Rohdaten-Archiv**: Jede Sendung wird vor der Verarbeitung komprimiert gespeichert. Die Datenbank lässt sich daraus jederzeit neu aufbauen.
- **Doppelte Sendungen** werden erkannt und erzeugen keine doppelten Werte. Teilstücke derselben Nacht werden zu einer Schlafsitzung zusammengeführt.
- **Quellen-Priorität**: Liefern mehrere Apps Schritte oder Kalorien, zählt pro Tag nur die bevorzugte Quelle.

**Export**
- **CSV**: ein Wert pro Tag und Messart, bei mehreren Messungen der Tagesdurchschnitt; pH-Werte als Einzelmessungen mit Uhrzeit. Wahlweise ein Zeitraum oder alle Daten.
- **PDF-Bericht** mit Diagrammen, z. B. für den Arztbesuch

**Oberfläche**
- Responsive für Desktop und Handy, auf dem Handy als App installierbar (PWA)
- Dark Mode, animierte Diagramme mit Apache ECharts
- Feste Zeitzone (Europe/Berlin), ein Tag läuft von 00:00 bis 24:00 Uhr

## Schnellstart

Voraussetzung: Docker mit Docker Compose.

```bash
git clone https://github.com/bmetallica/health-connect-dashboard.git
cd health-connect-dashboard
cp .env.example .env        # Passwörter anpassen!
docker compose up -d --build
```

| Port | Dienst |
|---|---|
| `8321` | Ingest-Endpunkt: nimmt JSON per `POST /ingest` entgegen |
| `8322` | Webinterface |

Alle Daten liegen unter `./data/`: `mariadb/` für die Datenbank, `raw/` für das Rohdaten-Archiv und `app/` für die APK-Datei zum Download.

> **Wichtig:** Die App hat **keine Anmeldung**. Betreibe sie nur im Heimnetz, über VPN oder hinter einem Reverse Proxy mit Authentifizierung. Gesundheitsdaten gehören nicht ungeschützt ins Internet.

## Daten senden

### Health-Connect-Daten

Erwartet wird ein JSON-Array mit einem Eintrag pro Datensatztyp, so wie es z. B. ein Tasker-Plugin für Health Connect liefert:

```json
[
  { "record_type": "HeartRateRecord", "data": { "records": [ { "...": "..." } ] } },
  { "record_type": "StepsRecord",     "data": { "records": [ { "...": "..." } ] } }
]
```

Unterstützte Typen: `HeartRateRecord`, `RestingHeartRateRecord`, `HeartRateVariabilityRmssdRecord`, `StepsRecord`, `DistanceRecord`, `ActiveCaloriesBurnedRecord`, `TotalCaloriesBurnedRecord`, `FloorsClimbedRecord`, `HydrationRecord`, `SleepSessionRecord`, `ExerciseSessionRecord`, `OxygenSaturationRecord`, `WeightRecord`, `BodyFatRecord`, `HeightRecord`, `BodyTemperatureRecord`, `RespiratoryRateRecord`, `Vo2MaxRecord`, `BloodPressureRecord`, `BloodGlucoseRecord`.

Unbekannte Typen gehen nicht verloren. Sie werden roh gespeichert.

Der optionale Header `X-Source` kennzeichnet den Absender, z. B. `tasker`. Die Absender erscheinen unter *Daten → Datenquellen*. Mit gzip komprimierte Sendungen (`Content-Encoding: gzip`) werden ebenfalls angenommen.

### pH-Werte

```bash
curl -X POST http://<server>:8321/ingest \
  -H 'Content-Type: application/json' -H 'X-Source: ph-app' \
  -d '{"date":"2026-09-04","time":"19:39:43","timestamp":1788543583913,"phValue":5.7}'
```

## HC Bridge (Android-App, optional)

Unter `android/` liegt eine kleine Android-App. Sie liest Health Connect direkt aus und ersetzt damit den Weg über Tasker.

- Liest nur Änderungen seit der letzten Synchronisation (Changes-API von Health Connect)
- Hält jede Sendung in einer ausfallsicheren Warteschlange und löscht sie erst, wenn der Server sie angenommen hat
- Läuft im Hintergrund über WorkManager und bringt einen Assistenten für die Akku-Einstellungen mit (getestet auf Samsung)
- Datentypen und Quellen sind einzeln wählbar, dazu ein Protokoll

Voraussetzung: Android 14 oder neuer.

**Bauen** (nur Docker nötig, kein lokales Android SDK):

```bash
./android/build.sh
```

Das Skript baut die APK in einem Container und legt sie unter `data/app/hc-bridge.apk` ab. Das Webinterface bietet sie dann unter *Daten → Datenquellen* zum Download an.

**Signieren:** Ohne eigenen Schlüssel wird die APK mit dem Debug-Schlüssel signiert. Für stabile Updates legst du einen eigenen Schlüssel an:

```bash
keytool -genkeypair -v -keystore android/keystore/hc-bridge.jks -alias hcbridge \
  -keyalg RSA -keysize 2048 -validity 10000
```

Dazu gehört die Datei `android/keystore/keystore.properties`:

```properties
storeFile=hc-bridge.jks
storePassword=...
keyAlias=hcbridge
keyPassword=...
```

Sichere den Ordner `android/keystore/` gut. Ohne ihn lassen sich keine Updates über die installierte App installieren. Erhöhe vor jedem Update `versionCode` in `android/app/build.gradle.kts`.

## pH-Wert (Android-App, optional)

Unter `android-ph/` liegt eine zweite App zur manuellen Erfassung von pH-Werten aus Teststreifen. Sie ist im selben Dark-Mode-Design gestaltet wie das Webinterface.

- **Großer Button „Messung erfassen“** ganz oben, die Eingabe öffnet sich als Bottom-Sheet.
- **Eigene Zifferntastatur ohne Komma-Fehler:** Es gibt genau eine Komma-Taste und höchstens zwei Nachkommastellen. Ein vergessenes Komma wird ergänzt, weil es keinen pH über 14 gibt: `68` wird zu 6,8, `675` zu 6,75. Dazu Feinjustierung mit ±0,1 sowie frei wählbares Datum und frei wählbare Uhrzeit für Nachträge.
- **Werte bleiben auch auf dem Handy**, mit Verlauf (Zielbereich, Punkte nach Status eingefärbt), Werteverteilung, Kennzahlen und Messliste. Werte lassen sich bearbeiten und löschen.
- **Offline-fähig:** Neue Werte werden im Hintergrund gesendet, sobald der Server erreichbar ist (WorkManager).
- **Eigenes Setup-Menü:** Server-Adresse und Ports mit Verbindungstest, Zielbereich (auch aus dem Webinterface übernehmbar), Import aller bisherigen Messungen vom Server.

Gesendet wird im oben beschriebenen pH-Format mit `X-Source: ph-app`. Voraussetzung: Android 8 oder neuer.

```bash
./android-ph/build.sh      # legt data/app/ph-app.apk ab, Download unter Daten → Datenquellen
```

Die App nutzt denselben Schlüssel wie die HC Bridge (`android/keystore/`).

## Fertige APKs

Fertig gebaute APKs beider Apps liegen unter [Releases](../../releases). Sie sind mit dem Schlüssel des Projekts signiert. Wer selbst baut, signiert mit dem eigenen Schlüssel. Dann lässt sich eine App aus den Releases nicht per Update ersetzen, sie muss vorher deinstalliert werden.

## Aufbau

```
server/          Node.js (Express) – Ingest, REST-API, Tageswerte, CSV, PDF, Analyse
web/             Svelte 5 + Vite + ECharts – Webinterface (PWA)
android/         HC Bridge – Kotlin, Jetpack Compose, Health Connect
android-ph/      pH-Wert – Kotlin, Jetpack Compose, Erfassung und Verlauf
Dockerfile       baut Frontend und Server in ein Image
docker-compose.yml  App + MariaDB 11.4
```

## Daten aus einer älteren Version übernehmen

Liegt beim Start eine `data/records.jsonl` aus der ersten Version vor, importiert die App sie automatisch ins Rohdaten-Archiv und verarbeitet sie. Die Originaldatei bleibt unverändert.

## Hinweis

Dies ist ein privates Hobbyprojekt und **kein Medizinprodukt**. Bewertungen, Zielbereiche und Analysen dienen nur der persönlichen Orientierung und ersetzen keine ärztliche Beratung.
