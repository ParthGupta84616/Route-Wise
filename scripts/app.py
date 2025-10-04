import json
import os
import folium

# Load route data from JSON file
DATA_FILE = os.path.join(os.path.dirname(__file__), "route_data.json")

def load_route_data(path):
    if not os.path.exists(path):
        raise FileNotFoundError(f"Route data file not found: {path}")
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    # Accept routeCoordinates format
    if "routeCoordinates" in data:
        if not isinstance(data["routeCoordinates"], list):
            raise ValueError("Invalid route data: 'routeCoordinates' missing or not a list")
        return data

    # Accept agents/jobs format
    if "agents" in data and "jobs" in data:
        if not isinstance(data["agents"], list) or not isinstance(data["jobs"], list):
            raise ValueError("Invalid route data: 'agents' and 'jobs' must be lists")
        return data

    # Accept OSRM/Mapbox-style routes format (do not mutate the file)
    if "routes" in data and isinstance(data["routes"], list) and data["routes"]:
        return data

    raise ValueError("Invalid route data: expected 'routeCoordinates' or 'agents'/'jobs' or 'routes'")

def _extract_coords_from_routes(data):
    # Try geometry.coordinates (lon,lat)
    routes = data.get("routes") or []
    if not routes:
        return None
    first = routes[0]
    geom = first.get("geometry") or {}
    coords = []
    if isinstance(geom, dict) and isinstance(geom.get("coordinates"), list):
        for c in geom["coordinates"]:
            if c and len(c) >= 2:
                try:
                    lon = float(c[0]); lat = float(c[1])
                    coords.append((lat, lon))
                except Exception:
                    continue
        if coords:
            return coords

    # Fallback: collect coordinates from steps' geometry or intersections
    for leg in first.get("legs", []):
        for step in leg.get("steps", []):
            sgeom = step.get("geometry") or {}
            if isinstance(sgeom, dict) and isinstance(sgeom.get("coordinates"), list):
                for c in sgeom["coordinates"]:
                    if c and len(c) >= 2:
                        try:
                            lon = float(c[0]); lat = float(c[1])
                            coords.append((lat, lon))
                        except Exception:
                            continue
            else:
                for inter in step.get("intersections", []):
                    loc = inter.get("location")
                    if loc and len(loc) >= 2:
                        try:
                            lon = float(loc[0]); lat = float(loc[1])
                            coords.append((lat, lon))
                        except Exception:
                            continue
    if coords:
        return coords

    # Final fallback: waypoints
    for wp in data.get("waypoints", []):
        loc = wp.get("location")
        if loc and len(loc) >= 2:
            try:
                lon = float(loc[0]); lat = float(loc[1])
                coords.append((lat, lon))
            except Exception:
                continue
    return coords or None

def build_map(route_data, out_html="route_map.html"):
    # If old-style routeCoordinates present, keep original behavior
    if "routeCoordinates" in route_data:
        coords = []
        for p in route_data["routeCoordinates"]:
            # Ensure required numeric keys exist
            try:
                lat = float(p["lat"])
                lng = float(p["lng"])
            except Exception as e:
                raise ValueError(f"Invalid coordinate entry: {p}") from e
            coords.append((lat, lng))

        if not coords:
            raise ValueError("No coordinates to plot")

        m = folium.Map(location=coords[0], zoom_start=10)

        # Draw colored segments for traffic
        for i in range(len(coords) - 1):
            color = route_data["routeCoordinates"][i].get("trafficColor", "#3388ff")
            folium.PolyLine(
                [coords[i], coords[i + 1]],
                color=color,
                weight=6,
                opacity=0.8
            ).add_to(m)

        # Add start & end markers
        folium.Marker(coords[0], popup="Start", icon=folium.Icon(color="green")).add_to(m)
        folium.Marker(coords[-1], popup="End", icon=folium.Icon(color="red")).add_to(m)

        m.save(out_html)
        return out_html

    # New: visualize OSRM/Mapbox-style routes (routes[0].geometry.coordinates)
    if "routes" in route_data:
        coords = _extract_coords_from_routes(route_data)
        if not coords:
            raise ValueError("No coordinates found in 'routes' to plot")

        m = folium.Map(location=coords[0], zoom_start=10)

        # Draw the full route
        folium.PolyLine(coords, color="#3388ff", weight=6, opacity=0.8).add_to(m)

        # Add start & end markers
        folium.Marker(coords[0], popup="Start", icon=folium.Icon(color="green")).add_to(m)
        folium.Marker(coords[-1], popup="End", icon=folium.Icon(color="red")).add_to(m)

        m.save(out_html)
        return out_html

    # New: visualize agents/jobs dummy data (unchanged)
    if "agents" in route_data and "jobs" in route_data:
        agents = route_data["agents"]
        jobs = route_data["jobs"]

        # Collect coordinates (note: input is [lon, lat] -> folium expects [lat, lon])
        points = []
        job_markers = []
        for j in jobs:
            loc = j.get("location")
            if not loc or len(loc) < 2:
                continue
            lat, lon = float(loc[1]), float(loc[0])
            points.append((lat, lon))
            job_markers.append({
                "loc": (lat, lon),
                "pickup": int(j.get("pickup_amount", 1)),
                "duration": int(j.get("duration", 0))
            })

        agent_markers = []
        for a in agents:
            s = a.get("start_location")
            e = a.get("end_location")
            cap = a.get("pickup_capacity", None)
            start = None
            end = None
            if s and len(s) >= 2:
                start = (float(s[1]), float(s[0]))
                points.append(start)
            if e and len(e) >= 2:
                end = (float(e[1]), float(e[0]))
                points.append(end)
            agent_markers.append({"start": start, "end": end, "capacity": cap})

        if not points:
            raise ValueError("No coordinates found in agents/jobs to plot")

        # center map on mean of collected points
        avg_lat = sum(p[0] for p in points) / len(points)
        avg_lon = sum(p[1] for p in points) / len(points)
        m = folium.Map(location=(avg_lat, avg_lon), zoom_start=14)

        # Add job markers (circle size ~ pickup_amount)
        for jm in job_markers:
            radius = 4 + jm["pickup"] * 2
            folium.CircleMarker(
                location=jm["loc"],
                radius=radius,
                color="#1f77b4",
                fill=True,
                fill_opacity=0.7,
                popup=f"pickup: {jm['pickup']}, duration: {jm['duration']}s"
            ).add_to(m)

        # Add agent start/end markers and simple straight lines (start->end)
        for idx, am in enumerate(agent_markers):
            if am["start"]:
                folium.Marker(
                    am["start"],
                    popup=f"Agent {idx} start (cap={am.get('capacity')})",
                    icon=folium.Icon(color="green", icon="play")
                ).add_to(m)
            if am["end"]:
                folium.Marker(
                    am["end"],
                    popup=f"Agent {idx} end",
                    icon=folium.Icon(color="red", icon="stop")
                ).add_to(m)
            if am["start"] and am["end"]:
                folium.PolyLine(
                    [am["start"], am["end"]],
                    color="#444444",
                    weight=2,
                    opacity=0.8,
                    dash_array="5"
                ).add_to(m)

        m.save(out_html)
        return out_html

    raise ValueError("Unsupported route data format")

def main():
    try:
        route_data = load_route_data(DATA_FILE)
    except Exception as e:
        print("❌ Failed to load route data:", e)
        return

    # Optionally write a cleaned formatted copy
    cleaned_path = os.path.join(os.path.dirname(__file__), "route_data_cleaned.json")
    with open(cleaned_path, "w", encoding="utf-8") as f:
        json.dump(route_data, f, indent=2, ensure_ascii=False)

    try:
        out = build_map(route_data, out_html=os.path.join(os.path.dirname(__file__), "route_map.html"))
        print(f"✅ Map saved as {out}. Open it in your browser.")
        print(f"✅ Cleaned JSON saved as {cleaned_path}.")
    except Exception as e:
        print("❌ Failed to build map:", e)

if __name__ == "__main__":
    main()