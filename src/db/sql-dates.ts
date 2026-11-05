// Devuelve la expresion SQL que serializa una columna TIMESTAMPTZ en ISO 8601 UTC, por
// ejemplo "2026-11-05T21:14:10.223Z", con el mismo nombre de columna.
// El texto con zona explicita lo interpreta igual cualquier cliente (new Date() en Node o
// en Angular). Con `columna::text` salia "2026-11-05 21:14:10" sin zona, y el navegador lo
// tomaba como hora argentina aunque fuera UTC: corria todo tres horas.
// Se usa en todos los repositorios Postgres para que haya una unica forma de devolver fechas.
export function isoDate(column: string): string {
  return `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS ${column}`;
}
