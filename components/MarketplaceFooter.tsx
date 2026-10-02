import Link from "next/link";

export default function MarketplaceFooter() {
  return (
    <footer className="maurilio-footer">
      <div className="maurilio-footer__brand">
        <strong>MAURILIO</strong>
        <span>Historial verificable. Suscripciones transparentes.</span>
      </div>
      <nav aria-label="Información legal">
        <Link href="/como-funciona">Cómo funciona</Link>
        <Link href="/juego-responsable">Juego responsable</Link>
        <Link href="/terminos">Términos</Link>
        <Link href="/privacidad">Privacidad</Link>
      </nav>
      <p>
        Maurilio no es una casa de apuestas, no acepta apuestas ni garantiza
        resultados. La información publicada por tipsters implica riesgo y está
        dirigida únicamente a mayores de 18 años.
      </p>
    </footer>
  );
}
