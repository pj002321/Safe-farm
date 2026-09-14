export interface GeocodeResult {
  lat: number;
  lng: number;
}

/** Kakao Local 주소검색 응답에서 좌표만 뽑는다. 못 찾으면 null. */
export function parseGeocodeResponse(json: unknown): GeocodeResult | null {
  const doc = (json as { documents?: { x: string; y: string }[] })
    .documents?.[0];
  if (!doc) return null;
  return { lat: Number(doc.y), lng: Number(doc.x) };
}
