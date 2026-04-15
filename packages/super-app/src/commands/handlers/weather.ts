import type { WeatherResult } from "../results";

interface WttrCondition {
  temp_C: string;
  FeelsLikeC: string;
  humidity: string;
  windspeedKmph: string;
  weatherDesc: { value: string }[];
}
interface WttrForecastDay {
  date: string;
  mintempC: string;
  maxtempC: string;
  hourly: { weatherDesc: { value: string }[] }[];
}
interface WttrResponse {
  nearest_area: { areaName: { value: string }[]; region: { value: string }[] }[];
  current_condition: WttrCondition[];
  weather: WttrForecastDay[];
}

export async function current(params: { location?: string } = {}): Promise<WeatherResult> {
  const url = `https://wttr.in/${encodeURIComponent(params.location ?? "")}?format=j1`;
  const res = await fetch(url, { headers: { "user-agent": "curl/8.0" } });
  if (!res.ok) throw new Error(`wttr.in returned ${res.status}`);
  const data = (await res.json()) as WttrResponse;
  const c = data.current_condition[0];
  const area = data.nearest_area[0];
  return {
    location: [area?.areaName?.[0]?.value, area?.region?.[0]?.value].filter(Boolean).join(", "),
    temperatureC: Number.parseFloat(c.temp_C),
    feelsLikeC: Number.parseFloat(c.FeelsLikeC),
    description: c.weatherDesc[0]?.value ?? "",
    humidity: Number.parseFloat(c.humidity),
    windKph: Number.parseFloat(c.windspeedKmph),
    forecast: data.weather.slice(0, 3).map((d) => ({
      date: d.date,
      minC: Number.parseFloat(d.mintempC),
      maxC: Number.parseFloat(d.maxtempC),
      description: d.hourly[Math.floor(d.hourly.length / 2)]?.weatherDesc[0]?.value ?? "",
    })),
  };
}
