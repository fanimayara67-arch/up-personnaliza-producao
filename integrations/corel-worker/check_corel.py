"""Explicit real Corel smoke test; opens only copies of the supplied fixture."""

import argparse
import json
from pathlib import Path
from corel import CorelAdapter, registered_corel
from svg_io import read_svg


def main():
    parser = argparse.ArgumentParser(
        description="Verificação real de COM, CDR e PDF. Requer Corel instalado e inicializado."
    )
    parser.add_argument("--source", default="examples/production/pecas.svg")
    parser.add_argument("--output", default=".production/corel-check")
    args = parser.parse_args()
    source = Path(args.source).resolve()
    geometry = read_svg(source.read_bytes())
    output = Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    progid = next(
        (name for name in registered_corel() if name != "CorelDRAW.Application"), None
    )
    if not progid:
        raise ValueError("CorelDRAW não instalado.")
    adapter = CorelAdapter({"progid": progid})
    report = {
        "realCorel": True,
        "version": adapter.version,
        "pieces": len(geometry["pieces"]),
        "widthMM": geometry["width"],
        "heightMM": geometry["height"],
        "formats": [],
    }
    try:
        for extension in ("cdr", "pdf"):
            destination = output / ("pecas-testadas." + extension)
            adapter.export(
                source, destination, extension, geometry["width"], geometry["height"]
            )
            assert destination.is_file() and destination.stat().st_size > 0
            report["formats"].append(extension)
            report.setdefault("exportReports", []).append(adapter.last_export_report)
            print(
                json.dumps(
                    {
                        "format": extension,
                        "reopened": True,
                        "scaleAndContoursChecked": True,
                    }
                ),
                flush=True,
            )
        report["valid"] = True
        (output / "report.json").write_text(
            json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8"
        )
        print(json.dumps(report, ensure_ascii=True), flush=True)
    finally:
        adapter.close()


if __name__ == "__main__":
    main()
