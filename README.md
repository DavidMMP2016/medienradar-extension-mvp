# 📡 JournalRadar - Browser Extension

**Ihr persönlicher Assistent für Medienkompetenz.**

JournalRadar ist eine Browser-Erweiterung, die Nachrichtenartikel in Echtzeit analysiert. Sie hilft Lesern dabei, Framing, emotionale Manipulation und den Faktengehalt von Texten zu erkennen, um sich eine informiertere Meinung zu bilden.

> ⚠️ **Status: Prototyp / MVP**
> Diese Erweiterung befindet sich in der Entwicklung und ist noch nicht im offiziellen Store verfügbar.

## 🌟 Funktionen

* **Echtzeit-Analyse:** Scannen Sie Artikel direkt auf der Webseite per Klick.
* **JournalScore:** Ein sofortiger Gesamt-Score (0-100) für die Qualität des Artikels.
* **Detaillierte Scorecard:**
    * 🧐 **Überschrift & Framing:** Erkennt Clickbait und suggestive Sprache.
    * 🧠 **Fakten & Substanz:** Bewertet den Anteil an überprüfbaren Informationen.
    * ⚖️ **Neutralität & Meinung:** Zeigt, wie stark Meinung und Fakten vermischt sind.
    * 🔥 **Emotionalität & Trigger:** Warnt vor Texten, die Wut oder Angst schüren wollen.
* **Bildanalyse:** Erkennt manipulative Bildauswahl (in Verbindung mit dem Backend).
* **Analyse-Timeline:** Zeigt Hauptakteure, rhetorische Auffälligkeiten und fehlende Aspekte im Detail.
* **Dashboard:** Verfolgen Sie Ihren persönlichen Lese-Verlauf und Qualitäts-Mix.

## ⚙️ Technologie

* **Plattform:** Chrome Extension (Manifest V3)
* **Frontend:** HTML, CSS (Dark Mode Design), Vanilla JavaScript
* **Backend:** Kommuniziert mit einem externen, sicheren Vercel-Backend (separates Repository) für die KI-Analyse.
* **Datenschutz:** Die Analyse erfolgt serverseitig, es werden keine persönlichen Daten der Nutzer gespeichert.

## 🛠️ Installation (Entwicklermodus)

Da die Erweiterung noch nicht im Store ist, muss sie manuell geladen werden:

1.  Klonen Sie dieses Repository oder laden Sie es als ZIP herunter und entpacken Sie es.
2.  Öffnen Sie Chrome und navigieren Sie zu `chrome://extensions`.
3.  Aktivieren Sie oben rechts den **Entwicklermodus** (Developer mode).
4.  Klicken Sie oben links auf **Entpackte Erweiterung laden** (Load unpacked).
5.  Wählen Sie den Ordner dieses Repositories aus.
6.  Das JournalRadar-Icon sollte nun in Ihrer Leiste erscheinen.