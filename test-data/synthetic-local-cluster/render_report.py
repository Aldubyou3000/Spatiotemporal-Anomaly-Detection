"""Render completed evidence using the bundled ReportLab runtime; no detector execution."""
import csv
import json
import subprocess
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.graphics import renderPDF, renderSVG
from reportlab.graphics.shapes import Drawing, Rect, String
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Image
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "evidence/extended"
POPPLER = Path.home() / ".cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe"
styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="SmallBody", parent=styles["BodyText"], fontSize=8.5, leading=12, spaceAfter=7))
styles.add(ParagraphStyle(name="Cell", fontName="Helvetica", fontSize=8, leading=11))
styles["BodyText"].fontSize = 10
styles["BodyText"].leading = 14
styles["BodyText"].spaceAfter = 9


def para(text, style="BodyText"):
    return Paragraph(escape(str(text)), styles[style])


def table(rows, widths=None):
    result = Table([[para(value, "Cell") for value in row] for row in rows], colWidths=widths, repeatRows=1, hAlign="LEFT")
    result.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e9eff5")),
        ("GRID", (0, 0), (-1, -1), .4, colors.HexColor("#ccd4df")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7), ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return result


def matrix_figure(title, matrix, labels, filename, annotations=None):
    count = len(labels)
    drawing = Drawing(600, 320)
    drawing.add(Rect(0, 0, 600, 320, fillColor=colors.white, strokeColor=None))
    drawing.add(String(300, 291, title, fontName="Helvetica-Bold", fontSize=18, textAnchor="middle"))
    drawing.add(String(380, 260, "Predicted classification", fontSize=11, textAnchor="middle"))
    width = 290 / count
    height = 170 / count
    for column, label in enumerate(labels):
        drawing.add(String(230 + (column + .5) * width, 237, label.title(), fontSize=11, textAnchor="middle"))
    for row, actual in enumerate(labels):
        y = 220 - (row + 1) * height
        drawing.add(String(20, y + height / 2 - 4, f"Actual {actual}", fontSize=12))
        for column, value in enumerate(matrix[row]):
            correct = row == column
            fill = "#e1f0e8" if correct else "#fff0db"
            x = 230 + column * width
            drawing.add(Rect(x, y, width, height, fillColor=colors.HexColor(fill), strokeColor=colors.HexColor("#b9c5d0"), strokeWidth=.6))
            drawing.add(String(x + width / 2, y + height / 2, str(value), fontName="Helvetica-Bold", fontSize=25, textAnchor="middle"))
            if annotations:
                drawing.add(String(x + width / 2, y + height / 2 - 19, annotations[row][column], fontSize=10, textAnchor="middle"))
    drawing.add(String(300, 19, "Controlled synthetic data | Counts, not percentages", fontSize=10, textAnchor="middle"))
    renderSVG.drawToFile(drawing, str(OUT / f"{filename}.svg"))
    cache = OUT / "render-cache"
    cache.mkdir(exist_ok=True)
    temporary = cache / f"{filename}.pdf"
    renderPDF.drawToFile(drawing, str(temporary))
    subprocess.run([str(POPPLER), "-singlefile", "-r", "180", "-png", str(temporary), str(OUT / filename)], check=True)
    temporary.unlink()
    cache.rmdir()
    return OUT / f"{filename}.png"


def footer(canvas, document):
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#536477"))
    canvas.drawString(48, 28, "Synthetic development evaluation | 27 October 2026 | No real AWS accuracy claim")
    canvas.drawRightString(564, 28, str(document.page))


def main():
    measures = json.loads((ROOT / "evidence/metrics.json").read_text())
    testing = json.loads((OUT / "testing_summary.json").read_text())
    checks = testing["checks"]
    lookup = {row["name"]: row for row in checks}
    errors = list(csv.DictReader((ROOT / "evidence/errors.csv").open(newline="", encoding="utf-8")))
    http_file = OUT / "http_checks.json"
    http = json.loads(http_file.read_text()) if http_file.exists() else []
    images = {}
    for direction in ("combined", "high", "low"):
        m = measures[direction]
        title = {"combined": "Combined anomaly detection", "high": "High-reading detection", "low": "Low-reading detection"}[direction]
        binary_labels = ["anomaly", "normal"] if direction == "combined" else [direction, "other"]
        images[direction] = matrix_figure(title, [[m["TP"], m["FN"]], [m["FP"], m["TN"]]],
                                         binary_labels, f"matrix_{direction}", [["TP", "FN"], ["FP", "TN"]])
    labels = ["normal", "high", "low"]
    images["direction"] = matrix_figure("Normal / high / low classification", [[measures["direction_matrix"][a][b] for b in labels] for a in labels], labels, "matrix_direction")
    story = [para("Controlled Synthetic Evaluation", "Title"),
             para("Rainfall anomaly detection - synchronized local station cluster", "Heading2"),
             para("Completed 27 October 2026. This report documents measured output from the unchanged application pipeline. "
                  "Every station location and rainfall measurement in this evaluation is hypothetical. No independent historical-data accuracy is claimed."),
             table([["Dataset property", "Evaluated fixture"], ["Station layout", "8 fictional QC-area sites; two nearby quartets"],
                    ["Shared observation period", "1-30 September 2023; all 24 hourly timestamps each day"],
                    ["Coverage", "5,760 hourly readings -> 240 assessed station-days"],
                    ["Reference labels", "8 high faults; 8 low faults; 224 valid readings"],
                    ["Distances", "Selected neighbors 0.43-0.62 km; maximum pair distance 3.1513 km"]], [130, 386]),
             Spacer(1, 12), Image(str(images["combined"]), width=465, height=248)]
    m = measures["combined"]
    story += [para(f"Precision {m['precision']:.2%} | Recall {m['recall']:.2%} | F1 {m['f1']:.2%} | Accuracy {m['accuracy']:.2%}", "Heading3"),
              para(f"The detector found {m['TP']} of 16 injected faults, missed {m['FN']}, and raised {m['FP']} false alarms among 224 valid readings. "
                   "An always-normal predictor would already achieve 93.33% accuracy but 0% recall. Accuracy alone therefore overstates the usefulness of this detector.", "SmallBody"),
              PageBreak(), para("Detection direction and metrics", "Title")]
    for direction in ("high", "low"):
        m = measures[direction]
        story += [Image(str(images[direction]), width=385, height=205),
                  para(f"Precision {m['precision']:.2%} | Recall {m['recall']:.2%} | F1 {m['f1']:.2%} | Accuracy {m['accuracy']:.2%}", "SmallBody")]
    story += [table([["Actual / predicted", "Normal", "High", "Low"],
                     *[[a.title(), *[measures["direction_matrix"][a][b] for b in labels]] for a in labels]], [180, 112, 112, 112]),
              Spacer(1, 8), para("High and low matrices are one-versus-rest. The high detector combines LOF with rainfall gates; the low detector uses separate rules. "
                   "The combined result evaluates the full flagging system, rather than LOF alone. No flags in the wrong direction occurred in this run.", "SmallBody"),
              PageBreak(), para("Repeatability and data quality", "Title"),
              para("Fresh-process runs use the application's default seeded generator. Same-process runs retain its advancing jitter state. "
                   "Changed-score counts use the scores exposed by the API schema. Wall times include local execution overhead and are not deployment benchmarks.", "SmallBody"),
              table([["Run", "Changed flags", "Changed scores", "Elapsed (s)"],
                     *[[r["run"], r["changed_flags"], r["changed_scores"], r["seconds"]] for r in testing["repeatability"]]], [180, 110, 110, 116]),
              Spacer(1, 12), para("Input and assessment checks", "Heading2")]
    quality_rows = [["Case", "Status", "Observed behavior"]]
    for row in checks:
        if row["name"] in {"isolated_missing_hour", "two_missing_hours", "absent_hourly_timestamp", "duplicate_timestamp", "negative_rainfall",
                            "infinite_rainfall", "malformed_timestamp", "three_stations_only", "nonoverlapping_station_dates", "all_dry_control", "uniform_heavy_rain_control"}:
            detail = row.get("detail", {})
            description = "Invalid input rejected" if detail.get("rejected") else (
                f"{detail.get('daily_rows', '?')} daily rows; {detail.get('assessed', '?')} assessed; {detail.get('unassessed', '?')} unassessed")
            if row["status"] == "FAIL":
                description = "See checks.json for the recorded failure"
            quality_rows.append([row["name"].replace("_", " "), row["status"], description])
    story += [table(quality_rows, [175, 50, 291]), Spacer(1, 8),
              para("These quality variants are separate engineering checks; they are not pooled into the 240-reading confusion matrices. "
                   "An unassessed reading is never treated as a confirmed normal prediction in the detection evaluation.", "SmallBody"),
              PageBreak(), para("Route tests and verification", "Title"),
              para(f"Extended check groups: {testing['passed']} passed, {testing['failed']} failed. "
                   "Passing these checks validates the evaluation and documented system behavior; it does not erase the detection errors.")]
    if http:
        story += [table([["HTTP check", "Observed status"], *[[r["case"], str(r["status"]) + (" -> done" if r.get("final_status") else "")] for r in http]], [370, 146])]
    else:
        story += [para("HTTP checks did not complete successfully; inspect testing_summary.json.")]
    regression = lookup["Complete existing backend regression suite"]
    story += [Spacer(1, 12), para("Existing backend regression suite", "Heading2"),
              para(f"Status: {regression['status']}. Existing tests executed: {regression.get('detail', {}).get('tests', 'see log')}. "
                   "The complete test log is backend_tests.txt. It covers existing quality, station review, history, event-stream and search checks."),
              para("Verification scope", "Heading2"),
              para("Synchronous multipart upload and async job polling exercised the actual local FastAPI router and pipeline. "
                   "Authentication was supplied through a synthetic dependency override and rate limiting was disabled only in the local test. "
                   "No actual user login, browser UI, production deployment, mobile device or database persistence was tested. "
                   "The HTTP checks are not an authentication or security certification."),
              para("Evidence chain", "Heading2"),
              para("The original manifest records source/input/prediction hashes, package versions and detector thresholds. "
                   "The extended package retains repeat outputs, all paired classifications, per-station and per-scenario breakdowns, "
                   "quality-case observations, route results and regression logs. Checksums establish which files were evaluated; "
                   "they are not external certification of the reference labels."),
              para("Limits on interpretation", "Heading2"),
              para("Reference labels identify deliberately injected sensor interventions and valid weather by construction. "
                   "The scenarios were designed with knowledge of the existing detector, so this is a development functional evaluation, "
                   "not a blinded holdout. The six-hour rainfall profiles are not calibrated meteorological simulations. "
                   "There are only 16 fault observations, including correlated station-days; the percentages do not establish real AWS performance. "
                   "The manuscript's historical-data evaluation still requires independently verified historical labels."),
              PageBreak(), para("Misclassifications and discussion", "Title")]
    story += [table([["Date", "Station", "Scenario", "Actual -> predicted"],
                     *[[r["date"], r["station_id"].replace("Synthetic", ""), r["scenario"].replace("_", " "),
                        r["expected_label"] + " -> " + r["predicted_label"]] for r in errors]], [70, 65, 251, 130]),
              Spacer(1, 12), para("Suggested Results and Discussion text", "Heading2"),
              para("The controlled evaluation comprised 240 station-day observations from eight hypothetical nearby stations with synchronized "
                   "hourly records. Reference labels specified 16 injected fault readings and 224 valid readings. The system correctly detected "
                   "12 faults, missed four, and incorrectly flagged seven valid readings. Combined precision, recall, F1-score and accuracy were "
                   "63.16%, 75.00%, 68.57% and 95.42%, respectively. High-reading precision was 50.00%, compared with 85.71% for low-reading detection; "
                   "both achieved 75.00% recall. These results apply only to the declared synthetic scenarios."),
              para("False alarms occurred on valid localized showers, a valid dry patch and ordinary station variation. Missed faults included "
                   "progressive overreporting, a zero fault during light rainfall and partial underreporting above the low rule's 1 mm ceiling. "
                   "The findings show that nearby stations and complete temporal overlap enable comparisons, but spatial disagreement alone "
                   "does not distinguish sensor error from legitimate local weather. The observed errors should be retained and reported "
                   "rather than removed by relabeling test cases."),
              para("Reproduction", "Heading2"),
              para("Run run_extended_testing.py using the API virtual environment. Run render_report.py using the bundled ReportLab runtime. "
                   "Both scripts and their required evidence files are included. The original generator remains separate so reference data "
                   "can be preserved without regeneration. The application algorithms and thresholds were not modified.", "SmallBody")]
    destination = OUT / "CONTROLLED_TEST_REPORT.pdf"
    document = SimpleDocTemplate(str(destination), pagesize=(612, 792), rightMargin=48, leftMargin=48, topMargin=42, bottomMargin=46,
                                 title="Controlled Synthetic Rainfall Evaluation", author="Research evaluation generated from recorded system output")
    document.build(story, onFirstPage=footer, onLaterPages=footer)
    reader = PdfReader(destination)
    assert len(reader.pages) == 5, f"Unexpected pagination: {len(reader.pages)} pages"
    text = "\n".join(page.extract_text() for page in reader.pages)
    for phrase in ["63.16%", "75.00%", "68.57%", "95.42%", "Misclassifications", "data quality"]:
        assert phrase.lower() in text.lower(), phrase
    markdown = (ROOT / "evidence/RESULTS.md").read_text()
    markdown += f"\n\n## Extended testing\n\n{testing['passed']} check groups passed; {testing['failed']} failed. "
    markdown += f"Existing backend regression tests: {regression.get('detail', {}).get('tests', 'see log')}. "
    markdown += "See CONTROLLED_TEST_REPORT.pdf for the complete discussion and scope limitations.\n\n"
    markdown += "| Check | Status |\n|---|---|\n" + "\n".join(f"| {r['name']} | {r['status']} |" for r in checks)
    (OUT / "FINAL_REPORT.md").write_text(markdown + "\n", encoding="utf-8")
    print(f"Created {destination}; 5 pages and 4 standalone PNG/SVG figures")


if __name__ == "__main__":
    main()
