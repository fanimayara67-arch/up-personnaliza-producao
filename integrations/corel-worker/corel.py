"""COM adapter against the installed type library, never guessed numeric constants."""

import json
import os
import shutil
from xml.etree import ElementTree
from defusedxml.ElementTree import fromstring
from pathlib import Path


def normalize_corel_svg(data):
    """Normalize only non-geometric metadata from the trusted Corel exporter."""
    root = fromstring(data)
    for element in root.iter():
        # Corel emits this presentation attribute without a clipping path.
        # Actual clip-path, masks, effects and all geometry remain untouched;
        # the strict production parser still rejects unsupported constructs.
        if element.get("clip-rule") in ("evenodd", "nonzero"):
            del element.attrib["clip-rule"]
    return ElementTree.tostring(root, encoding="utf-8", xml_declaration=True)


def verify_corel_roundtrip(expected, actual, tolerance=0.05):
    if any(abs(expected[key] - actual[key]) > tolerance for key in ("width", "height")):
        raise ValueError("Escala divergente após reabrir o arquivo Corel.")
    remaining = [piece["geometry"] for piece in actual["pieces"]]
    if len(remaining) != len(expected["pieces"]):
        raise ValueError("Quantidade de contornos mudou após exportação Corel.")
    for piece in expected["pieces"]:
        geometry = piece["geometry"]
        best = min(
            range(len(remaining)),
            key=lambda index: geometry.hausdorff_distance(remaining[index]),
        )
        candidate = remaining.pop(best)
        if geometry.hausdorff_distance(
            candidate
        ) > tolerance or geometry.symmetric_difference(candidate).area > tolerance * (
            geometry.length + candidate.length
        ):
            raise ValueError("Contorno, posição ou vazado mudou após exportação Corel.")


def registered_corel():
    if os.name != "nt":
        return []
    import winreg

    found = []
    with winreg.OpenKey(winreg.HKEY_CLASSES_ROOT, "") as root:
        index = 0
        while True:
            try:
                name = winreg.EnumKey(root, index)
                index += 1
            except OSError:
                break
            if name.startswith("CorelDRAW.Application"):
                found.append(name)
    return sorted(found, reverse=True)


class CorelAdapter:
    def __init__(self, config):
        import pythoncom, win32com.client

        pythoncom.CoInitialize()
        progid = config.get("progid")
        if progid not in registered_corel():
            raise ValueError("Selecione um ProgID CorelDRAW registrado neste Windows.")
        self.app = win32com.client.DispatchEx(progid)
        # Generate wrappers/constants from the type library of the running installation.
        self.app = win32com.client.gencache.EnsureDispatch(self.app)
        self.constants = win32com.client.constants
        self.app.Visible = True
        self.version = str(self.app.Version)
        self.config = config
        self.documents = []
        self.hwnd = int(self.app.AppWindow.Handle)
        import win32process, win32event, win32api, winerror

        _, pid = win32process.GetWindowThreadProcessId(self.hwnd)
        self.mutex = win32event.CreateMutex(
            None, True, "Local\\UPProduction-Corel-" + str(pid)
        )
        if win32api.GetLastError() == winerror.ERROR_ALREADY_EXISTS:
            raise ValueError(
                "Esta instância do Corel já está reservada por outro conector."
            )
        if self.app.Documents.Count:
            raise ValueError(
                "A instância de produção contém documentos abertos. Use uma instância exclusiva e vazia do Corel."
            )

    def constant(self, name):
        try:
            return getattr(self.constants, name)
        except AttributeError:
            raise ValueError(
                "Constante indisponível nesta versão do CorelDRAW: " + name
            )

    def inspect(self, doc):
        if doc.Pages.Count != 1:
            raise ValueError("Use um documento com uma página de produção.")
        doc.Unit = self.constant("cdrMillimeter")
        count = 0
        texts = []
        open_curves = []

        def scan(shapes):
            nonlocal count
            for shape in shapes:
                count += 1
                if shape.Type == self.constant("cdrTextShape"):
                    texts.append(str(shape.Text.Story.Font))
                elif shape.Type == self.constant("cdrGroupShape"):
                    scan(shape.Shapes)
                elif shape.Type == self.constant("cdrCurveShape"):
                    for subpath in shape.Curve.SubPaths:
                        if not subpath.Closed:
                            open_curves.append(str(shape.Name))

        scan(doc.ActivePage.Shapes)
        if texts:
            raise ValueError(
                "Documento contém texto ("
                + ", ".join(sorted(set(texts)))
                + "). Confira fontes ausentes no Corel e converta em curvas em uma cópia antes de enviar. Nenhuma substituição automática foi feita."
            )
        if open_curves:
            raise ValueError(
                "Documento contém contornos abertos. Corrija-os explicitamente no Corel."
            )
        return {
            "objects": count,
            "fontsChecked": "Sem texto; não houve substituição de fontes.",
            "openContours": len(open_curves),
        }

    def svg(self, doc, path):
        import win32com.client

        export = doc.ExportEx(
            str(path),
            self.constant("cdrSVG"),
            self.constant("cdrCurrentPage"),
            None,
            None,
        )
        # Export filters provide an embedded, unregistered type library.
        library = export._oleobj_.GetTypeInfo().GetContainingTypeLib()[0]
        win32com.client.gencache.EnsureModuleForTypelibInterface(
            library, bForDemand=False
        )
        export = win32com.client.Dispatch(export._oleobj_)
        candidates = {
            key: value
            for group in self.constants.__dict__.get("__dicts__", [])
            for key, value in group.items()
            if key.lower().startswith("svg") and "millimet" in key.lower()
        }
        if len(candidates) != 1:
            raise ValueError(
                "A biblioteca de tipos instalada não informou uma unidade SVG milimétrica inequívoca. Valide o perfil desta versão."
            )
        export.Units = next(iter(candidates.values()))
        export.Styling = self.constant("svgPresentationAttributes")
        export.Encoding = self.constant("svgUTF8")
        export.Finish()
        from svg_io import read_svg

        raw = Path(path).read_bytes()
        Path(path).with_suffix(".corel.svg").write_bytes(raw)
        normalized = normalize_corel_svg(raw)
        source = read_svg(normalized)
        if (
            abs(source["width"] - doc.ActivePage.SizeWidth) > 0.05
            or abs(source["height"] - doc.ActivePage.SizeHeight) > 0.05
        ):
            raise ValueError("Escala divergente no SVG exportado pelo Corel.")
        Path(path).write_bytes(normalized)

    def prepare(self, original, directory):
        working = Path(directory) / ("working" + Path(original).suffix)
        shutil.copy2(original, working)
        doc = self.app.OpenDocument(str(working.resolve()))
        self.documents.append(doc)
        inspection = self.inspect(doc)
        target = Path(directory) / "working.svg"
        self.svg(doc, target)
        return target, inspection

    def _write_export(
        self, svg_path, destination, format, width, height, offset=(0, 0)
    ):
        doc = self.app.OpenDocument(str(Path(svg_path).resolve()))
        self.documents.append(doc)
        doc.Unit = self.constant("cdrMillimeter")
        # SVG is opened centered on the default Corel page. SetSize preserves
        # that center and restores the known physical SVG viewport, not scale.
        doc.ActivePage.SetSize(width, height)
        if offset != (0, 0):
            # Corel uses Y up; the checked SVG/PDF viewport uses Y down.
            doc.ActivePage.Shapes.All().Move(-offset[0], offset[1])
        if (
            abs(doc.ActivePage.SizeWidth - width) > 0.05
            or abs(doc.ActivePage.SizeHeight - height) > 0.05
        ):
            raise ValueError("Escala de página divergente ao abrir no Corel.")
        if format == "cdr":
            doc.SaveAs(str(Path(destination).resolve()), None)
        elif format == "pdf":
            doc.PublishToPDF(str(Path(destination).resolve()))
        else:
            raise ValueError("Exportação Corel não suportada pelo perfil.")
        # Validate the file actually saved, rather than exporting the in-memory
        # source document a second time.
        doc.Dirty = False
        doc.Close()
        self.documents.remove(doc)

    def _read_export(self, destination):
        from svg_io import read_svg

        doc = self.app.OpenDocument(str(Path(destination).resolve()))
        self.documents.append(doc)
        doc.Unit = self.constant("cdrMillimeter")
        roundtrip = Path(destination).with_suffix(".roundtrip.svg")
        self.svg(doc, roundtrip)
        return roundtrip, read_svg(roundtrip.read_bytes())

    def export(self, svg_path, destination, format, width, height):
        from svg_io import read_svg
        from shapely.affinity import translate

        expected = read_svg(Path(svg_path).read_bytes())
        self._write_export(svg_path, destination, format, width, height)
        roundtrip, actual = self._read_export(destination)
        self.last_export_report = {
            "format": format,
            "reopened": True,
            "pageOriginCorrectionMM": [0, 0],
        }
        try:
            verify_corel_roundtrip(expected, actual)
        except ValueError:
            # This installed Corel PDF filter can introduce a uniform page-origin
            # offset. Correct only a small, proven rigid translation on the copy;
            # changed contours, holes, dimensions or quantities remain failures.
            if format != "pdf" or len(expected["pieces"]) != len(actual["pieces"]):
                raise
            dx = min(p["geometry"].bounds[0] for p in actual["pieces"]) - min(
                p["geometry"].bounds[0] for p in expected["pieces"]
            )
            dy = min(p["geometry"].bounds[1] for p in actual["pieces"]) - min(
                p["geometry"].bounds[1] for p in expected["pieces"]
            )
            if max(abs(dx), abs(dy)) > 0.25:
                raise ValueError(
                    "Origem PDF fora do limite de qualificação. Use CDR/SVG."
                )
            shifted = {
                **expected,
                "pieces": [
                    {**p, "geometry": translate(p["geometry"], dx, dy)}
                    for p in expected["pieces"]
                ],
            }
            verify_corel_roundtrip(shifted, actual)
            previous = self.documents.pop()
            previous.Dirty = False
            previous.Close()
            self._write_export(svg_path, destination, format, width, height, (dx, dy))
            roundtrip, actual = self._read_export(destination)
            verify_corel_roundtrip(expected, actual)
            self.last_export_report["pageOriginCorrectionMM"] = [dx, dy]
        self.last_export_report["scaleAndContoursChecked"] = True
        return roundtrip

    def ecut(self, request_path):
        profile = self.config.get("ecut", {})
        if (
            not profile.get("verified")
            or profile.get("corelVersion") != self.version
            or not profile.get("documentationUrl")
            or not profile.get("version")
            or not profile.get("module")
            or not profile.get("macro")
        ):
            raise ValueError(
                "eCut sem perfil de automação validado para esta versão. Use o motor UP ou valide a ponte com o fornecedor."
            )
        # Calls a locally installed, reviewed bridge implementing the JSON file contract.
        # Module/macro must come from the installed version's vendor documentation.
        return self.app.GMSManager.RunMacro(
            profile["module"], profile["macro"], str(Path(request_path).resolve())
        )

    def close(self):
        for doc in reversed(self.documents):
            try:
                doc.Dirty = False
                doc.Close()
            except Exception:
                pass
        self.documents = []
