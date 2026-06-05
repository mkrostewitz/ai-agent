export const WIDGET_CORS_HEADERS = {
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Max-Age": "86400",
};

export function withWidgetCors(response) {
  Object.entries(WIDGET_CORS_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
}

export function widgetOptionsResponse() {
  return new Response(null, {
    headers: WIDGET_CORS_HEADERS,
    status: 204,
  });
}
