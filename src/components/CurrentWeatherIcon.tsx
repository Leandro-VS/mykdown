import { useEffect, useState, type ComponentType } from "react";
import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Moon,
  Sun,
  type LucideProps,
} from "lucide-react";
import {
  fetchSaoPauloWeather,
  type CurrentWeather,
  type WeatherKind,
} from "../services/weather";

const REFRESH_INTERVAL = 15 * 60 * 1_000;
const REQUEST_TIMEOUT = 8_000;

function weatherIcon(
  kind: WeatherKind,
  isDay: boolean,
): ComponentType<LucideProps> {
  switch (kind) {
    case "clear":
      return isDay ? Sun : Moon;
    case "partly-cloudy":
      return isDay ? CloudSun : CloudMoon;
    case "cloudy":
      return Cloud;
    case "fog":
      return CloudFog;
    case "rain":
      return CloudRain;
    case "snow":
      return CloudSnow;
    case "thunderstorm":
      return CloudLightning;
  }
}

export function CurrentWeatherIcon() {
  const [weather, setWeather] = useState<CurrentWeather | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let active = true;
    let requestController: AbortController | null = null;

    const update = async () => {
      requestController?.abort();
      requestController = new AbortController();
      const timeout = window.setTimeout(
        () => requestController?.abort(),
        REQUEST_TIMEOUT,
      );
      try {
        const nextWeather = await fetchSaoPauloWeather(
          requestController.signal,
        );
        if (active) {
          setWeather(nextWeather);
          setUnavailable(false);
        }
      } catch {
        if (active) setUnavailable(true);
      } finally {
        window.clearTimeout(timeout);
      }
    };

    void update();
    const interval = window.setInterval(() => void update(), REFRESH_INTERVAL);
    return () => {
      active = false;
      requestController?.abort();
      window.clearInterval(interval);
    };
  }, []);

  const Icon = weather ? weatherIcon(weather.kind, weather.isDay) : CloudSun;
  const label = weather
    ? `${weather.description}, ${weather.temperature} °C em São Paulo`
    : unavailable
      ? "Clima de São Paulo indisponível"
      : "Consultando o clima de São Paulo";

  return (
    <div
      className={`current-weather${weather ? "" : " current-weather-pending"}`}
      role="img"
      aria-label={label}
      title={`${label}. Dados meteorológicos: Open-Meteo`}
    >
      <span className="weather-icon-shell" aria-hidden="true">
        <Icon size={28} strokeWidth={1.65} />
      </span>
    </div>
  );
}
