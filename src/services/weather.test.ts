import { describe, expect, it } from "vitest";
import { describeWeather, weatherKindFromCode } from "./weather";

describe("weatherKindFromCode", () => {
  it.each([
    [0, "clear"],
    [2, "partly-cloudy"],
    [3, "cloudy"],
    [45, "fog"],
    [61, "rain"],
    [82, "rain"],
    [71, "snow"],
    [95, "thunderstorm"],
  ])("maps WMO code %i to %s", (code, expected) => {
    expect(weatherKindFromCode(code)).toBe(expected);
  });

  it("falls back to cloudy for an unknown code", () => {
    expect(weatherKindFromCode(500)).toBe("cloudy");
  });
});

describe("describeWeather", () => {
  it("distinguishes a clear day from a clear night", () => {
    expect(describeWeather("clear", true)).toBe("Ensolarado");
    expect(describeWeather("clear", false)).toBe("Céu limpo");
  });
});
