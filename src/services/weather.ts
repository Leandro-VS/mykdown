const SAO_PAULO_WEATHER_URL =
  "https://api.open-meteo.com/v1/forecast?latitude=-23.5505&longitude=-46.6333&current=temperature_2m,weather_code,is_day&timezone=America%2FSao_Paulo&forecast_days=1";

export type WeatherKind =
  | "clear"
  | "partly-cloudy"
  | "cloudy"
  | "fog"
  | "rain"
  | "snow"
  | "thunderstorm";

export type CurrentWeather = {
  kind: WeatherKind;
  isDay: boolean;
  temperature: number;
  description: string;
};

export function weatherKindFromCode(code: number): WeatherKind {
  if (code === 0) return "clear";
  if (code === 1 || code === 2) return "partly-cloudy";
  if (code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) {
    return "rain";
  }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
    return "snow";
  }
  if (code >= 95 && code <= 99) return "thunderstorm";
  return "cloudy";
}

export function describeWeather(kind: WeatherKind, isDay: boolean): string {
  switch (kind) {
    case "clear":
      return isDay ? "Ensolarado" : "Céu limpo";
    case "partly-cloudy":
      return "Parcialmente nublado";
    case "cloudy":
      return "Nublado";
    case "fog":
      return "Com neblina";
    case "rain":
      return "Chuvoso";
    case "snow":
      return "Com neve";
    case "thunderstorm":
      return "Com tempestade";
  }
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function fetchSaoPauloWeather(
  signal?: AbortSignal,
): Promise<CurrentWeather> {
  const response = await fetch(SAO_PAULO_WEATHER_URL, { signal });
  if (!response.ok) throw new Error("Não foi possível consultar o clima.");

  const payload = (await response.json()) as {
    current?: Record<string, unknown>;
  };
  const code = readNumber(payload.current?.weather_code);
  const isDayValue = readNumber(payload.current?.is_day);
  const temperature = readNumber(payload.current?.temperature_2m);

  if (code === null || isDayValue === null || temperature === null) {
    throw new Error("A resposta do clima é inválida.");
  }

  const kind = weatherKindFromCode(code);
  const isDay = isDayValue === 1;
  return {
    kind,
    isDay,
    temperature: Math.round(temperature),
    description: describeWeather(kind, isDay),
  };
}
