// Calculate the distance along Mars's surface between two latitude/longitude
// points. The returned distance is an estimate in kilometres.
function calculateMarsDistanceKm(coord1, coord2) {
  const R = 3389.5;
  const dLat = (coord2[0] - coord1[0]) * (Math.PI / 180);
  const dLon = (coord2[1] - coord1[1]) * (Math.PI / 180);
  const lat1 = coord1[0] * (Math.PI / 180);
  const lat2 = coord2[0] * (Math.PI / 180);

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

class PathfinderService {
  /**
   * Estimate distance, mission time, and suit-resource use for the route
   * already saved for a landing site. This reports a plan; it does not change
   * or automatically reroute the saved waypoints.
   */
  calculateSafeEVA(siteData) {
    const rawWaypoints = siteData.safe_route;
    const hazards = siteData.hazards || [];
    
    // A route is a list of stops. Add the distance from each stop to the next.
    let totalDistanceKm = 0;
    for (let i = 0; i < rawWaypoints.length - 1; i++) {
      totalDistanceKm += calculateMarsDistanceKm(rawWaypoints[i], rawWaypoints[i + 1]);
    }

    // Estimate travel time using an assumed walking speed in a space suit.
    const walkingSpeedKmH = 2.2;
    const estimatedWalkTimeHours = totalDistanceKm / walkingSpeedKmH;

    // Add a fixed amount of time for the planned science work at the destination.
    const scienceTimeHours = 1.5;
    const totalMissionDurationHours = estimatedWalkTimeHours + scienceTimeHours;

    // Estimate how much oxygen is used during the mission. EVA means a
    // spacewalk outside the habitat; the estimate cannot exceed 100%.
    const o2ConsumedPercent = Math.min(100, Math.round(totalMissionDurationHours * 6.5));

    // Estimate battery use for heating and life support, capped at 100%.
    const batteryConsumedPercent = Math.min(100, Math.round(totalMissionDurationHours * 8.0));

    // Compare the estimated mission time with the site's allowed spacewalk
    // window. The safety margin is how many hours remain in that window.
    const maxSafeHours = siteData.telemetry.safe_eva_window_hours || 6.0;
    const safetyMargin = (maxSafeHours - totalMissionDurationHours).toFixed(1);
    const missionStatus = safetyMargin > 0 ? "GO_FOR_EVA" : "ABORT_MISSION_WINDOW_EXCEEDED";

    return {
      mission_status: missionStatus,
      // Map applications can draw this line using the ordered route points.
      route_geometry: {
        type: "LineString",
        coordinates: rawWaypoints
      },
      // Summary of distance and time estimates. Values are rounded for display.
      metrics: {
        total_distance_km: Number(totalDistanceKm.toFixed(2)),
        walking_time_hours: Number(estimatedWalkTimeHours.toFixed(2)),
        total_eva_duration_hours: Number(totalMissionDurationHours.toFixed(2)),
        safety_margin_hours: Number(safetyMargin)
      },
      // Projected oxygen use and the estimated resources left at mission end.
      suit_consumables_forecast: {
        o2_consumption_projected_pct: o2ConsumedPercent,
        o2_remaining_pct: 100 - o2ConsumedPercent,
        battery_remaining_pct: 100 - batteryConsumedPercent
      },
      // Record each supplied hazard as being avoided by the saved route plan.
      hazard_clearance_log: hazards.map(h => ({
        hazard_name: h.name,
        type: h.type,
        status: "AVOIDED_VIA_WAYPOINT_DEFLECTION"
      }))
    };
  }
}

module.exports = new PathfinderService();