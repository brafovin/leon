# Auto Drift 🏁

Ein 3D-Open-World-Rennspiel im Browser – ohne Build-Schritt und ohne Installation.
Fünf handgemachte Welten, prozedural erzeugtes Gelände, Arcade-Fahrphysik mit
Drift und Boost, Touch-Steuerung fürs Handy – und als Startwagen ein
**BMW M3 (E30)**.

![Three.js](https://img.shields.io/badge/Three.js-r161-000?logo=three.js)
![No build step](https://img.shields.io/badge/Build-keiner-brightgreen)

## Starten

```bash
node server.mjs        # oder: npm start
```

Dann <http://localhost:8080> im Browser öffnen. Jeder andere statische Server geht
genauso (`python3 -m http.server`, `npx http-server` …) – nur direkt per
`file://` funktioniert es nicht, weil ES-Module über HTTP geladen werden müssen.

## Deployment (Vercel & Co.)

Das Spiel ist eine rein statische Seite. `npm run build` kopiert alles
Auszuliefernde nach `dist/`:

```bash
npm run build      # erzeugt dist/ (index.html, style.css, src/, vendor/)
```

`vercel.json` legt genau das für Vercel fest – Framework `null`,
Build `node build.mjs`, Ausgabeverzeichnis `dist`. Ohne diese Angaben findet
Vercel im Projektwurzelverzeichnis kein eindeutiges Ziel und liefert nur eine
404-Seite aus.

Zeigt die Live-Version danach weiterhin 404, liegt es an den Projekt-
einstellungen bei Vercel und nicht am Code:

* **Root Directory** muss das Repository-Wurzelverzeichnis sein (Feld leer lassen).
* **Production Branch** muss auf den Branch zeigen, auf dem der Code liegt.

## Die fünf Welten

| # | Welt | Charakter |
|---|------|-----------|
| 1 | **Horizon Bay** | Mediterrane Küste, Klippen, Palmen, türkisblaues Meer |
| 2 | **Alpen Gipfel** | Hochgebirge mit Schneefall, Serpentinen, Nadelwald |
| 3 | **Neon City** | Nachtrennen im Regen zwischen Hochhäusern und Neonlicht |
| 4 | **Sahara Dünen** | Dünenmeer im Sandsturm bei Sonnenuntergang |
| 5 | **Tropen Insel** | Vulkaninsel mit Lagune und Sonnenaufgang über dem Riff |

Jede Welt hat ein eigenes Höhenprofil, eigene Licht- und Nebelstimmung, eigenes
Wetter, eigene Vegetation und eine eigene, prozedural erzeugte Rundstrecke mit
12 Checkpoints.

## Steuerung

### Am Rechner

| Taste | Funktion |
|-------|----------|
| `W` / `↑` | Gas |
| `S` / `↓` | Bremse & Rückwärtsgang |
| `A` `D` / `←` `→` | Lenken |
| `Leertaste` | Handbremse (Drift) |
| `Shift` | Boost |
| `Enter` | Rennen starten (2 Runden gegen 3 KI-Gegner) |
| `C` | Kamera: Verfolger / Weit / Cockpit / Kino |
| `R` | Auto auf die Strecke zurücksetzen |
| `M` | Sound an/aus |
| `Esc` | Pause / Festival-Menü |

Ein Gamepad wird ebenfalls unterstützt (RT = Gas, LT = Bremse, linker Stick = Lenkung,
A = Handbremse, B = Boost).

### Am Handy

Auf Touchgeräten blendet das Spiel automatisch eine eigene Bedienung ein:

* **Linke Bildschirmhälfte** – irgendwo antippen und ziehen: analoge Lenkung,
  der Lenkknopf erscheint dort, wo der Finger aufsetzt.
* **GAS / BREMSE** – große runde Pedale unten rechts.
* **DRIFT / BOOST** – kleine Knöpfe darüber.
* **RENNEN / KAM / RESET / II** – Aktionen oben rechts.

Beim Start wird Vollbild und Querformat angefordert; hochkant erscheint ein
Dreh-Hinweis und das Spiel pausiert so lange. Menü, Garage und Overlays sind
für schmale und flache Displays eigens umgebaut. Je nach Gerät werden
Geländeauflösung, Vegetationsdichte, Schatten, Wetterpartikel und
Renderauflösung automatisch reduziert.

## Spielinhalt

* **Freie Fahrt** in jeder Welt – die komplette 1,9 × 1,9 km große Karte ist befahrbar.
* **Rennen** über zwei Runden gegen drei KI-Gegner, mit Platzierung, Rundenzeiten und Bestzeit-Speicherung.
* **Skill-Punkte** für lange Drifts und weite Sprünge werden direkt in Credits umgerechnet.
* **Garage** mit acht Fahrzeugen: BMW M3 E30 (Start), BMW M5 Competition,
  BMW M3 Touring, Ford Mustang GT, Toyota GR Supra, Porsche 911 GT3,
  Lamborghini Huracán und Bugatti Chiron.
  Alle Fahrleistungen (Vmax, 0–100, Bremsweg, Antriebsart) sind in der Physik hinterlegt.
* Startguthaben: **999.000.000 CR** – alle Fahrzeuge stehen damit sofort offen.
* Fortschritt (Credits, Fahrzeuge, Bestzeiten) wird im `localStorage` gespeichert.

## Grafik

* **Prozedurale Wolken** im Himmels-Shader (fBm auf einer Kuppelprojektion),
  je Welt in Menge und Farbe abgestimmt und langsam ziehend.
* **Nachbearbeitung** ohne Zusatzbibliotheken: Szene in ein Rendertarget,
  Bloom über Bright-Pass und zwei Blur-Durchgänge in halber Auflösung,
  danach Farbraumwandlung, Sättigung, Kontrast und Vignette in einem Pass.
* **Detailtexturen** für Asphalt und Gelände, im Code als Rauschen erzeugt
  und über die Vertex-Farben gelegt.
* **Umgebungs-Map** aus den Himmelsfarben für Lackreflexionen, Hemisphere-Licht
  mit der Geländefarbe als Bodenfarbe.

Auf schwacher Hardware werden Bloom und danach die gesamte Nachbearbeitung
automatisch abgeschaltet.

## Technik

Reines JavaScript mit ES-Modulen, gerendert über [Three.js](https://threejs.org)
(lokal in `vendor/` abgelegt, damit das Spiel auch offline läuft).

```
index.html          Menü, HUD, Overlays
style.css           komplettes UI
server.mjs          winziger statischer Server
src/
  main.js           Menü, Spielstand, Ablaufsteuerung
  game.js           Szene, Kamera, Rennlogik, Partikel, Qualitätsautomatik
  worlds.js         Definition der fünf Welten (Höhenfunktion, Licht, Farben)
  track.js          prozedurale Rundstrecke (Spline, Asphalt, Leitpfosten)
  terrain.js        Höhenfeld, eingeebnet entlang der Straße, Vertex-Farben, Wasser
  props.js          Vegetation & Hochhäuser als InstancedMesh + Kollision
  cars.js           Fahrzeugdaten und Karosseriebau aus Silhouetten
  postfx.js         Bloom, Farbkorrektur und Vignette
  textures.js       prozedurale Detailtexturen
  device.js         Geräteerkennung und Qualitätsstufen
  physics.js        Fahrphysik (Gänge, Grip, Drift, Sprünge) und KI-Gegner
  sky.js            Himmels-Shader, Sterne, Regen/Schnee/Sand
  hud.js            Tacho und Minimap auf 2D-Canvas
  input.js          Tastatur & Gamepad
  audio.js          synthetischer Motor-, Reifen- und Windsound (WebAudio)
```

Bemerkenswerte Details:

* **Gelände & Straße passen zusammen:** Die Strecke wird zuerst als Spline erzeugt,
  ihre Höhe geglättet, und anschließend wird das Höhenfeld im Umkreis von 20 m
  weich auf Straßenniveau gezogen.
* **Fahrphysik:** Längs- und Querkräfte werden getrennt berechnet; Gänge, Drehmomentkurve,
  Luft- und Rollwiderstand sind so abgestimmt, dass jedes Auto seine angegebene
  Höchstgeschwindigkeit tatsächlich erreicht (M5: 302 km/h gemessen, 0–100 in 2,8 s).
* **Kein einziges Asset:** Autos, Bäume, Häuser, Himmel, Wolken, Texturen,
  Reflexionen und Sound entstehen zur Laufzeit im Code.
* **Qualitätsautomatik:** Sinkt die Bildrate, werden Auflösung, Schatten und
  Wetterpartikel automatisch reduziert.
