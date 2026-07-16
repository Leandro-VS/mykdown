const SAO_PAULO_HOUR = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  hourCycle: "h23",
});

export type Greeting = "Bom dia" | "Boa tarde" | "Boa noite";

export function getSaoPauloGreeting(date = new Date()): Greeting {
  const hour = Number(SAO_PAULO_HOUR.format(date));
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}
