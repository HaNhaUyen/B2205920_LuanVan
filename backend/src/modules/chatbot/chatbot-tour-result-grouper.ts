export type ChatbotDepartureSummary = {
  departureId: string;
  departureDate: string | null;
  endDate: string | null;
  remainingSlots: number;
  status: string;
  adultPrice: number;
};

export type ChatbotTourDepartureGroup = {
  tourId: string;
  tour: any;
  departures: any[];
  departureSummaries: ChatbotDepartureSummary[];
  nearestDepartureDate: Date | null;
  priceFrom: number;
};

export function getDepartureRemainingSlots(departure: any) {
  return (
    Number(departure?.totalSlots || 0) -
    Number(departure?.bookedSlots || 0) -
    Number(departure?.heldSlots || 0)
  );
}

export function toDepartureSummary(departure: any): ChatbotDepartureSummary {
  return {
    departureId: String(departure?.id || ""),
    departureDate: departure?.departureDate
      ? new Date(departure.departureDate).toISOString()
      : null,
    endDate: departure?.endDate
      ? new Date(departure.endDate).toISOString()
      : null,
    remainingSlots: getDepartureRemainingSlots(departure),
    status: String(departure?.status || ""),
    adultPrice: Number(
      departure?.adultPrice || departure?.tour?.basePriceAdult || 0,
    ),
  };
}

export function groupDeparturesByTour(
  matchedDepartures: any[],
  options: {
    maxTours: number;
    maxDeparturesPerTour: number;
    requestedDate?: string | null;
  },
): ChatbotTourDepartureGroup[] {
  const grouped = new Map<
    string,
    { tourId: string; tour: any; departures: any[] }
  >();
  const seenDepartureKeys = new Set<string>();

  for (const item of matchedDepartures || []) {
    const tourId = String(item?.tourId || item?.tour?.id || "");
    const departureId = String(item?.id || item?.departureId || "");
    if (!tourId || !departureId) continue;

    const duplicateKey = `${tourId}:${departureId}`;
    if (seenDepartureKeys.has(duplicateKey)) continue;
    seenDepartureKeys.add(duplicateKey);

    if (!grouped.has(tourId)) {
      grouped.set(tourId, {
        tourId,
        tour: item.tour || null,
        departures: [],
      });
    }

    grouped.get(tourId)!.departures.push(item);
  }

  const requestedTime = options.requestedDate
    ? new Date(`${options.requestedDate}T00:00:00+07:00`).getTime()
    : null;

  return Array.from(grouped.values())
    .map((group) => {
      const departures = group.departures
        .slice()
        .sort(
          (a, b) =>
            new Date(a.departureDate || 0).getTime() -
            new Date(b.departureDate || 0).getTime(),
        );
      const limitedDepartures = departures.slice(
        0,
        options.maxDeparturesPerTour,
      );
      const nearestDepartureDate = limitedDepartures[0]?.departureDate
        ? new Date(limitedDepartures[0].departureDate)
        : null;
      const priceFrom = Math.min(
        ...limitedDepartures.map((item) =>
          Number(item?.adultPrice || item?.tour?.basePriceAdult || 0),
        ),
      );
      return {
        tourId: group.tourId,
        tour: group.tour,
        departures: limitedDepartures,
        departureSummaries: limitedDepartures.map(toDepartureSummary),
        nearestDepartureDate,
        priceFrom: Number.isFinite(priceFrom) ? priceFrom : 0,
        _allDepartures: departures,
        _requestedDistance:
          requestedTime && nearestDepartureDate
            ? Math.abs(nearestDepartureDate.getTime() - requestedTime)
            : Number.MAX_SAFE_INTEGER,
      };
    })
    .sort((a: any, b: any) => {
      const openA = a.departures.some(
        (item: any) =>
          String(item.status) === "open" &&
          getDepartureRemainingSlots(item) > 0,
      )
        ? 0
        : 1;
      const openB = b.departures.some(
        (item: any) =>
          String(item.status) === "open" &&
          getDepartureRemainingSlots(item) > 0,
      )
        ? 0
        : 1;
      return (
        a._requestedDistance - b._requestedDistance ||
        openA - openB ||
        (a.nearestDepartureDate?.getTime() || 0) -
          (b.nearestDepartureDate?.getTime() || 0) ||
        a.priceFrom - b.priceFrom
      );
    })
    .slice(0, options.maxTours)
    .map(({ _allDepartures, _requestedDistance, ...group }: any) => group);
}
