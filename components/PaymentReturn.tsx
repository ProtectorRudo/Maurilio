type State = "success" | "pending" | "failure";

const content: Record<State, { kicker: string; title: string; body: string }> = {
  success: {
    kicker: "PAGO INFORMADO",
    title: "Estamos verificando la operación.",
    body: "Volviste desde el checkout. Por seguridad, esta pantalla no concede acceso por sí sola: el servidor debe confirmar primero el estado real de la order.",
  },
  pending: {
    kicker: "PAGO PENDIENTE",
    title: "La operación todavía no terminó.",
    body: "Algunos medios de pago demoran en acreditarse. El contenido seguirá cerrado hasta que el proveedor confirme la operación.",
  },
  failure: {
    kicker: "OPERACIÓN NO COMPLETADA",
    title: "No se desbloqueó ningún contenido.",
    body: "El pago fue cancelado o no pudo completarse. Podés volver al Matchday sin que esta pantalla modifique ningún acceso.",
  },
};

export default function PaymentReturn({ state }: { state: State }) {
  const copy = content[state];
  return (
    <main className="payment-return">
      <div className="return-card">
        <a className="brand return-brand" href="/maurilio">
          <span className="brand-mark">M</span>
          <span><b>MAURILIO</b><small>QUANT FOOTBALL</small></span>
        </a>
        <span className={state === "failure" ? "return-kicker failure" : "return-kicker"}>{copy.kicker}</span>
        <h1>{copy.title}</h1>
        <p>{copy.body}</p>
        <div className="return-security">
          <b>SERVER VERIFIED ACCESS</b>
          <span>La URL de retorno nunca funciona como comprobante de pago.</span>
        </div>
        <a className="primary-button" href="/maurilio">Volver al Matchday</a>
      </div>
    </main>
  );
}
