"""Real contour nesting: deterministic vertex-contact heuristic, independently checked by GEOS.
No optimality claim. Source Bézier/arc data is retained in SVG output.
"""

import math
import time
from collections import Counter
from shapely.geometry import Polygon, MultiPolygon, box
from shapely import affinity
from svg_io import apply_matrix, export_svg, read_svg


def solid(geom):
    if geom.geom_type == "Polygon":
        return Polygon(geom.exterior)
    from shapely.ops import unary_union

    return unary_union([Polygon(p.exterior) for p in geom.geoms])


def vertices(geom, limit=120):
    polygons = [geom] if geom.geom_type == "Polygon" else geom.geoms
    coords = []
    for p in polygons:
        for ring in [p.exterior, *p.interiors]:
            coords.extend(list(ring.coords)[:-1])
    if len(coords) > limit:
        coords = coords[:: math.ceil(len(coords) / limit)]
    return coords


def moved(piece, angle, x, y):
    r = math.radians(angle)
    c, s = math.cos(r), math.sin(r)
    rotated = affinity.rotate(piece["geometry"], angle, origin=(0, 0))
    a, b, _, _ = rotated.bounds
    matrix = [c, s, -s, c, x - a, y - b]
    return apply_matrix(piece["geometry"], matrix), matrix


def validate(source, params, placements):
    errors = []
    by_id = {p["id"]: p for p in source["pieces"]}
    counts = Counter()
    geometries = []
    margin = params["margin"]
    tol = source["tolerance"]
    inner = box(margin, margin, params["width"] - margin, params["height"] - margin)
    for index, placement in enumerate(placements):
        pid = placement.get("pieceId")
        m = placement.get("matrix", [])
        if (
            pid not in by_id
            or len(m) != 6
            or not all(isinstance(v, (int, float)) and math.isfinite(v) for v in m)
        ):
            errors.append("Transformação ou identificação inválida.")
            continue
        a, b, c, d, _, _ = m
        if (
            abs(a * a + b * b - 1) > 1e-7
            or abs(c * c + d * d - 1) > 1e-7
            or abs(a * c + b * d) > 1e-7
            or abs(a * d - b * c - 1) > 1e-7
        ):
            errors.append("A escala ou o espelhamento da peça foi alterado.")
        angle = math.degrees(math.atan2(b, a)) % 360
        if not any(
            abs((angle - r + 180) % 360 - 180) < 1e-6 for r in params["rotations"]
        ):
            errors.append("Rotação fora das opções permitidas.")
        geom = apply_matrix(by_id[pid]["geometry"], m)
        counts[pid] += 1
        if not inner.buffer(1e-7).covers(geom):
            errors.append(f"Peça {index+1} fora da chapa ou das margens.")
        for previous in geometries:
            occupied = previous if params.get("allowHoles") else solid(previous)
            current = geom if params.get("allowHoles") else solid(geom)
            if current.intersection(occupied).area > 1e-8:
                errors.append(f"Sobreposição na peça {index+1}.")
            if current.distance(occupied) + 1e-7 < params["gap"]:
                errors.append(f"Espaçamento insuficiente na peça {index+1}.")
        geometries.append(geom)
    expected = {pid: params.get("quantities", {}).get(pid, 1) for pid in by_id}
    if dict(counts) != expected:
        errors.append("Quantidade de peças diferente da solicitada.")
    return {
        "valid": not errors,
        "errors": list(dict.fromkeys(errors)),
        "pieces": sum(counts.values()),
        "expected": sum(expected.values()),
        "counts": dict(counts),
        "toleranceMm": tol,
        "checks": [
            "contornos GEOS",
            "transformações rígidas e escala",
            "rotações",
            "quantidades",
            "limites e margens",
            "colisões",
            "distâncias mínimas",
            "vazados",
        ],
        "kerfApplied": False,
        "camPending": params.get("camPending", True),
        "camNote": "Compensação e percursos devem ser conferidos no perfil do CAM antes do corte.",
    }


def nest(source, params, progress=lambda *_: None):
    start = time.monotonic()
    deadline = start + params["timeLimit"]
    m = params["margin"] + source["tolerance"]
    safe_gap = params["gap"] + 2 * source["tolerance"]
    placements = []
    geometries = []
    copies = [
        piece
        for piece in source["pieces"]
        for _ in range(params.get("quantities", {}).get(piece["id"], 1))
    ]
    copies.sort(key=lambda p: p["geometry"].area, reverse=True)
    if len(copies) > 200:
        raise ValueError("Limite de 200 peças.")
    for index, piece in enumerate(copies):
        if time.monotonic() > deadline:
            break
        best = None
        for angle in params["rotations"]:
            candidate, _ = moved(piece, angle, 0, 0)
            occupied = candidate if params.get("allowHoles") else solid(candidate)
            _, _, w, h = candidate.bounds
            xs = {m}
            ys = {m}
            points = {(m, m)}
            for previous in geometries:
                x0, y0, x1, y1 = previous.bounds
                xs.update([x1 + safe_gap, max(m, x0 - w - safe_gap)])
                ys.update([y1 + safe_gap, max(m, y0 - h - safe_gap)])
                # Contact candidates use actual vertices, including hole boundaries.
                expanded = previous.buffer(safe_gap, join_style="mitre")
                for ax, ay in vertices(expanded):
                    for bx, by in vertices(occupied, 40):
                        points.add((ax - bx, ay - by))
            points.update((x, y) for x in xs for y in ys)
            for x, y in sorted(points, key=lambda p: (p[1], p[0])):
                if time.monotonic() > deadline:
                    break
                if (
                    x < m - 1e-7
                    or y < m - 1e-7
                    or x + w > params["width"] - m + 1e-7
                    or y + h > params["height"] - m + 1e-7
                ):
                    continue
                geom = affinity.translate(occupied, x, y)
                if any(
                    geom.intersection(
                        prev if params.get("allowHoles") else solid(prev)
                    ).area
                    > 1e-8
                    or geom.distance(prev if params.get("allowHoles") else solid(prev))
                    + 1e-7
                    < safe_gap
                    for prev in geometries
                ):
                    continue
                score = (y + h, x + w, y, x)
                if best is None or score < best[0]:
                    best = (score, angle, x, y)
        if best is None:
            break
        _, angle, x, y = best
        geom, matrix = moved(piece, angle, x, y)
        placements.append({"pieceId": piece["id"], "matrix": matrix, "rotation": angle})
        geometries.append(geom)
        progress(
            15 + int((index + 1) / len(copies) * 65),
            f"{index+1} de {len(copies)} peças posicionadas e conferidas por contorno.",
        )
    report = validate(source, params, placements)
    report["elapsedSeconds"] = round(time.monotonic() - start, 3)
    report["utilization"] = sum(g.area for g in geometries) / (
        params["width"] * params["height"]
    )
    report["engine"] = (
        "UP contour / Shapely GEOS (heurística real; sem garantia de ótimo global)"
    )
    return {"placements": placements, "validation": report}


def checked_svg(source, params, placements):
    data = export_svg(source, placements, params["width"], params["height"])
    reread = read_svg(data, source["tolerance"])
    if (
        abs(reread["width"] - params["width"]) > 1e-6
        or abs(reread["height"] - params["height"]) > 1e-6
        or len(reread["pieces"]) != len(placements)
    ):
        raise ValueError("Escala ou quantidade divergente após exportação.")
    for p, q in zip(placements, reread["pieces"]):
        original = next(v for v in source["pieces"] if v["id"] == p["pieceId"])
        expected = apply_matrix(original["geometry"], p["matrix"])
        if expected.hausdorff_distance(q["geometry"]) > source["tolerance"] * 2 + 1e-6:
            raise ValueError("Contorno divergente após exportação.")
    return data


def export_dxf(source, params, placements, path):
    import ezdxf

    document = ezdxf.new("R2010")
    document.units = ezdxf.units.MM
    space = document.modelspace()
    expected = []
    for placement in placements:
        piece = next(p for p in source["pieces"] if p["id"] == placement["pieceId"])
        geom = apply_matrix(piece["geometry"], placement["matrix"])
        for polygon in [geom] if geom.geom_type == "Polygon" else geom.geoms:
            for ring in [polygon.exterior, *polygon.interiors]:
                points = [(x, params["height"] - y) for x, y in list(ring.coords)[:-1]]
                space.add_lwpolyline(points, close=True)
                expected.append(points)
    document.saveas(path)
    reopened = ezdxf.readfile(path)
    if reopened.units != ezdxf.units.MM:
        raise ValueError("DXF exportado sem unidade milímetro.")
    entities = list(reopened.modelspace().query("LWPOLYLINE"))
    if len(entities) != len(expected):
        raise ValueError("Quantidade de contornos divergente após exportação DXF.")
    from shapely.geometry import LineString

    for entity, points in zip(entities, expected):
        actual = [(p[0], p[1]) for p in entity.get_points()]
        if (
            not entity.closed
            or LineString(actual + [actual[0]]).hausdorff_distance(
                LineString(points + [points[0]])
            )
            > 1e-6
        ):
            raise ValueError("Escala ou contorno divergente após exportação DXF.")
