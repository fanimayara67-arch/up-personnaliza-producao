"""Restricted physical-scale SVG reader. Original curves are retained in exports."""

import copy
import math
import re
import xml.etree.ElementTree as ET
from defusedxml.ElementTree import fromstring
from shapely.geometry import Polygon, MultiPolygon, LineString
from shapely import affinity
from svgpathtools import parse_path, Line, Arc

IDENTITY = (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)
SVG = "http://www.w3.org/2000/svg"
ET.register_namespace("", SVG)


def multiply(a, b):
    x, y, u, v, e, f = a
    X, Y, U, V, E, F = b
    return (
        x * X + u * Y,
        y * X + v * Y,
        x * U + u * V,
        y * U + v * V,
        x * E + u * F + e,
        y * E + v * F + f,
    )


def transform(text):
    out = IDENTITY
    rest = re.sub(r"([A-Za-z]+)\s*\(([^)]*)\)", "", text or "").strip(" ,\t\n")
    if rest:
        raise ValueError("Transformação SVG inválida.")
    for name, values in re.findall(r"([A-Za-z]+)\s*\(([^)]*)\)", text or ""):
        n = [float(x) for x in re.split(r"[\s,]+", values.strip()) if x]
        if not all(math.isfinite(x) for x in n):
            raise ValueError("Transformação não finita.")
        if name == "matrix" and len(n) == 6:
            m = tuple(n)
        elif name == "translate" and len(n) in (1, 2):
            m = (1, 0, 0, 1, n[0], n[1] if len(n) > 1 else 0)
        elif name == "scale" and len(n) in (1, 2):
            m = (n[0], 0, 0, n[-1], 0, 0)
        elif name == "rotate" and len(n) in (1, 3):
            r = math.radians(n[0])
            m = (math.cos(r), math.sin(r), -math.sin(r), math.cos(r), 0, 0)
            if len(n) == 3:
                m = multiply(
                    multiply((1, 0, 0, 1, n[1], n[2]), m), (1, 0, 0, 1, -n[1], -n[2])
                )
        elif name in ("skewX", "skewY") and len(n) == 1:
            k = math.tan(math.radians(n[0]))
            m = (1, 0, k, 1, 0, 0) if name == "skewX" else (1, k, 0, 1, 0, 0)
        else:
            raise ValueError("Transformação SVG não suportada: " + name)
        out = multiply(out, m)
    if abs(out[0] * out[3] - out[1] * out[2]) < 1e-12:
        raise ValueError("Objeto sem escala válida.")
    return out


def apply_matrix(geom, m):
    return affinity.affine_transform(geom, [m[0], m[2], m[1], m[3], m[4], m[5]])


def length_mm(text):
    m = re.fullmatch(r"\s*([+\-\d.eE]+)\s*(mm|cm|in|pt|pc|px)?\s*", text or "")
    if not m or not m[2]:
        raise ValueError(
            "SVG sem escala física. Exporte largura e altura em mm, cm ou polegadas."
        )
    n = (
        float(m[1])
        * {
            "mm": 1,
            "cm": 10,
            "in": 25.4,
            "pt": 25.4 / 72,
            "pc": 25.4 / 6,
            "px": 25.4 / 96,
        }[m[2]]
    )
    if not math.isfinite(n) or n <= 0 or n > 10000:
        raise ValueError("Dimensão do SVG inválida.")
    return n


def flatten_segment(segment, tolerance, depth=0):
    if isinstance(segment, Line):
        return [segment.start, segment.end]
    if isinstance(segment, Arc):
        radius = max(abs(segment.radius.real), abs(segment.radius.imag))
        step = 2 * math.acos(max(-1, min(1, 1 - tolerance / max(radius, tolerance))))
        count = max(2, math.ceil(abs(math.radians(segment.delta)) / max(step, 1e-6)))
        if count > 50000:
            raise ValueError("Curva muito complexa para a tolerância.")
        return [segment.point(i / count) for i in range(count + 1)]
    points = (
        [segment.start]
        + [
            getattr(segment, key)
            for key in ("control", "control1", "control2")
            if hasattr(segment, key)
        ]
        + [segment.end]
    )
    chord = LineString(
        [(points[0].real, points[0].imag), (points[-1].real, points[-1].imag)]
    )
    from shapely.geometry import Point

    if max(chord.distance(Point(p.real, p.imag)) for p in points) <= tolerance:
        return [points[0], points[-1]]
    if depth >= 24:
        raise ValueError("Curva excedeu o limite de subdivisão.")
    left, right = segment.split(0.5)
    return flatten_segment(left, tolerance, depth + 1)[:-1] + flatten_segment(
        right, tolerance, depth + 1
    )


def contours_to_polygon(rings):
    polygons = []
    for ring in rings:
        p = Polygon(ring)
        if not p.is_valid or p.area <= 1e-9:
            raise ValueError(
                "Contorno inválido, degenerado ou com auto-interseção. Corrija no editor."
            )
        polygons.append(p)
    for i, a in enumerate(polygons):
        for b in polygons[i + 1 :]:
            if a.equals(b) or a.boundary.intersects(b.boundary):
                raise ValueError(
                    "Contornos duplicados ou cruzados dentro da mesma peça."
                )
    result = []
    for i, p in enumerate(polygons):
        parents = [j for j, q in enumerate(polygons) if j != i and q.contains(p)]
        if len(parents) % 2 == 0:
            holes = [
                list(q.exterior.coords)
                for j, q in enumerate(polygons)
                if p.contains(q)
                and sum(r.contains(q) for k, r in enumerate(polygons) if k != j)
                == len(parents) + 1
            ]
            result.append(Polygon(p.exterior.coords, holes))
    out = MultiPolygon(result) if len(result) > 1 else result[0]
    if not out.is_valid:
        raise ValueError("Composição dos vazados inválida.")
    return out


def read_svg(data, tolerance=0.05):
    if len(data) > 25 * 1024 * 1024:
        raise ValueError("SVG acima do limite.")
    root = fromstring(data)
    if root.tag.split("}")[-1] != "svg":
        raise ValueError("O arquivo não é SVG.")
    width, height = length_mm(root.get("width")), length_mm(root.get("height"))
    view = [float(x) for x in re.split(r"[\s,]+", root.get("viewBox", "").strip()) if x]
    if len(view) != 4 or not all(math.isfinite(v) for v in view) or min(view[2:]) <= 0:
        raise ValueError("SVG precisa de viewBox válido para preservar a escala.")
    sx, sy = width / view[2], height / view[3]
    # Default meet can add a viewport offset; reject ambiguity instead of stretching.
    if abs(sx - sy) > 1e-7 and root.get("preserveAspectRatio") != "none":
        raise ValueError(
            "Proporções de página e viewBox divergentes. Reexporte com escala física coerente."
        )
    base = (sx, 0, 0, sy, -view[0] * sx, -view[1] * sy)
    pieces = []
    warnings = []
    nodes = 0

    def visit(element, parent, style):
        nonlocal nodes
        nodes += 1
        if nodes > 10000:
            raise ValueError("SVG tem objetos demais.")
        tag = element.tag.split("}")[-1]
        if tag in ("title", "desc", "metadata"):
            return
        if tag not in (
            "svg",
            "g",
            "path",
            "rect",
            "circle",
            "ellipse",
            "polygon",
            "polyline",
        ):
            raise ValueError(
                "Objeto não suportado: "
                + tag
                + ". Converta textos em curvas e remova recursos externos no editor."
            )
        for key, value in element.attrib.items():
            if (
                key.lower().startswith("on")
                or any(x in key.lower() for x in ("href", "clip", "mask", "filter"))
                or "url(" in value.lower()
            ):
                raise ValueError(
                    "SVG contém recurso externo, script, máscara ou efeito. Exporte contornos simples."
                )
        own = dict(style)
        for field in (
            "fill",
            "fill-rule",
            "stroke",
            "stroke-width",
            "display",
            "visibility",
        ):
            if element.get(field) is not None:
                own[field] = element.get(field)
        for declaration in element.get("style", "").split(";"):
            if ":" in declaration:
                k, v = declaration.split(":", 1)
                if k.strip() not in (
                    "fill",
                    "fill-rule",
                    "stroke",
                    "stroke-width",
                    "display",
                    "visibility",
                    "opacity",
                    "fill-opacity",
                    "stroke-opacity",
                    "stroke-linejoin",
                    "stroke-linecap",
                    "stroke-miterlimit",
                ):
                    raise ValueError(
                        "Estilo SVG que pode alterar a geometria não é suportado. Exporte atributos vetoriais explícitos."
                    )
                own[k.strip()] = v.strip()
        if own.get("display") == "none" or own.get("visibility") == "hidden":
            raise ValueError(
                "Há objetos ocultos. Remova-os ou torne-os visíveis antes de produzir."
            )
        matrix = multiply(parent, transform(element.get("transform", "")))
        if tag in ("svg", "g"):
            for child in element:
                visit(child, matrix, own)
            return
        scale = math.sqrt(sum(x * x for x in matrix[:4]))
        local_tol = tolerance / max(scale, 1e-9)

        def number(key, default=0):
            v = float(element.get(key, default))
            if not math.isfinite(v):
                raise ValueError("Coordenada não finita.")
            return v

        rings = []
        if tag == "path":
            path = parse_path(element.get("d", ""))
            for subpath in path.continuous_subpaths():
                if not subpath.isclosed():
                    raise ValueError(
                        "Contorno aberto. Feche explicitamente no editor; não foi alterado automaticamente."
                    )
                points = []
                for segment in subpath:
                    points += flatten_segment(segment, local_tol)[:-1]
                if points:
                    points.append(points[0])
                    rings.append([(p.real, p.imag) for p in points])
        elif tag in ("polygon", "polyline"):
            ns = [
                float(v)
                for v in re.split(r"[\s,]+", element.get("points", "").strip())
                if v
            ]
            if len(ns) % 2 or len(ns) < 6:
                raise ValueError("Polígono inválido.")
            ring = list(zip(ns[::2], ns[1::2]))
            if tag == "polyline" and ring[0] != ring[-1]:
                raise ValueError("Polilinha aberta.")
            rings = [ring]
        elif tag == "rect":
            x, y, w, h = number("x"), number("y"), number("width"), number("height")
            if element.get("rx") or element.get("ry"):
                raise ValueError(
                    "Converta retângulos arredondados em curvas antes de enviar."
                )
            if min(w, h) <= 0:
                raise ValueError("Retângulo sem área.")
            rings = [[(x, y), (x + w, y), (x + w, y + h), (x, y + h), (x, y)]]
        else:
            x, y = number("cx"), number("cy")
            rx = number("r") if tag == "circle" else number("rx")
            ry = number("r") if tag == "circle" else number("ry")
            if min(rx, ry) <= 0:
                raise ValueError("Elipse sem área.")
            count = max(
                16,
                math.ceil(
                    2
                    * math.pi
                    / max(2 * math.acos(max(-1, 1 - local_tol / max(rx, ry))), 1e-6)
                ),
            )
            if count > 50000:
                raise ValueError("Elipse muito complexa.")
            rings = [
                [
                    (
                        x + rx * math.cos(i * 2 * math.pi / count),
                        y + ry * math.sin(i * 2 * math.pi / count),
                    )
                    for i in range(count + 1)
                ]
            ]
        if not rings:
            raise ValueError("Peça sem contorno.")
        geom = apply_matrix(contours_to_polygon(rings), matrix)
        if (
            not geom.is_valid
            or geom.area < 1e-6
            or max(abs(v) for v in geom.bounds) > 1e6
        ):
            raise ValueError("Geometria ou escala inválida.")
        if len(rings) > 1 and own.get("fill-rule", "nonzero") != "evenodd":
            # Nesting interprets closed nested boundaries as cut holes, independent of paint.
            warnings.append(
                "Vazados interpretados pelos contornos fechados; confira a prévia de corte."
            )
        if own.get("stroke") not in (None, "none"):
            warnings.append(
                "Espessura visual do traço não é compensação de ferramenta. O corte usa a linha central do contorno."
            )
        clean = copy.deepcopy(element)
        clean.attrib.pop("transform", None)
        clean.attrib.pop("id", None)
        clean.attrib.pop("style", None)
        clean.set("fill-rule", "evenodd")
        clean.set("fill", "#242a27")
        clean.set("stroke", "none")
        pieces.append(
            {
                "id": "p" + str(len(pieces) + 1),
                "name": element.get("id") or "Peça " + str(len(pieces) + 1),
                "geometry": geom,
                "element": clean,
                "matrix": matrix,
            }
        )
        if len(pieces) > 200:
            raise ValueError("Limite de 200 objetos vetoriais.")

    visit(root, base, {})
    if not pieces:
        raise ValueError("Nenhuma peça vetorial encontrada.")
    duplicates = []
    for i, p in enumerate(pieces):
        a = affinity.translate(
            p["geometry"], -p["geometry"].bounds[0], -p["geometry"].bounds[1]
        )
        for q in pieces[:i]:
            b = affinity.translate(
                q["geometry"], -q["geometry"].bounds[0], -q["geometry"].bounds[1]
            )
            if a.equals(b):
                duplicates.append([q["id"], p["id"]])
    if duplicates:
        warnings.append(
            "Há objetos com contornos idênticos. Foram mantidos como peças separadas; confira as quantidades."
        )
    return {
        "pieces": pieces,
        "width": width,
        "height": height,
        "tolerance": tolerance,
        "warnings": list(dict.fromkeys(warnings)),
        "duplicates": duplicates,
    }


def analysis_summary(source):
    return {
        "width": source["width"],
        "height": source["height"],
        "unit": "mm",
        "tolerance": source["tolerance"],
        "warnings": source["warnings"],
        "duplicates": source["duplicates"],
        "missingFonts": [],
        "textPolicy": "Textos são recusados; envie curvas.",
        "pieces": [
            {
                "id": p["id"],
                "name": p["name"],
                "width": p["geometry"].bounds[2] - p["geometry"].bounds[0],
                "height": p["geometry"].bounds[3] - p["geometry"].bounds[1],
                "area": p["geometry"].area,
            }
            for p in source["pieces"]
        ],
    }


def export_svg(source, placements, width, height):
    root = ET.Element(
        "{" + SVG + "}svg",
        {
            "width": f"{width:.9f}mm",
            "height": f"{height:.9f}mm",
            "viewBox": f"0 0 {width:.9f} {height:.9f}",
        },
    )
    by_id = {p["id"]: p for p in source["pieces"]}
    for index, placement in enumerate(placements):
        piece = by_id[placement["pieceId"]]
        matrix = multiply(placement["matrix"], piece["matrix"])
        group = ET.SubElement(
            root,
            "{" + SVG + "}g",
            {
                "id": f"up-piece-{index+1}",
                "transform": "matrix(" + " ".join(f"{v:.12g}" for v in matrix) + ")",
            },
        )
        group.append(copy.deepcopy(piece["element"]))
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)
