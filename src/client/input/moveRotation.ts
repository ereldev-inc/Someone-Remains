/**
 * Les touches de déplacement sont relatives à l'écran (haut = loin de la caméra). Quand la caméra tourne
 * de `yaw`, on les convertit en direction du monde : le haut de l'écran est la direction (−sin yaw, −cos yaw).
 */
export function rotateMove(mx: number, my: number, yaw: number, out: { x: number; y: number }): void {
  const s = Math.sin(yaw);
  const c = Math.cos(yaw);
  out.x = mx * c + my * s;
  out.y = -mx * s + my * c;
}
